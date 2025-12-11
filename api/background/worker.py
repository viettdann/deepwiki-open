"""
Async background worker for wiki generation.
Single worker to avoid rate limit issues.
"""
import asyncio
import json
import logging
import os
import re
import time
import xml.etree.ElementTree as ET
from typing import Optional, Dict, Any, List, Callable, Awaitable

import google.generativeai as genai
from adalflow.components.model_client.ollama_client import OllamaClient
from adalflow.core.types import ModelType

from api.core.database import get_db
from api.background.models import JobStatus, PageStatus, JobProgressUpdate
from api.background.job_manager import JobManager
import aiohttp

from api.config import get_model_config, configs, OPENROUTER_API_KEY, OPENAI_API_KEY, DEEPSEEK_API_KEY, PAGE_CONCURRENCY
from api.openai_client import OpenAIClient
from api.azureai_client import AzureAIClient
from api.openrouter_client import OpenRouterClient
from api.deepseek_client import DeepSeekClient
from api.rag import RAG

logger = logging.getLogger(__name__)

# Maximum retries per page
MAX_PAGE_RETRIES = 3

# Progress callback type
ProgressCallback = Callable[[JobProgressUpdate], Awaitable[None]]


class WikiGenerationWorker:
    """
    Single async worker that processes wiki generation jobs sequentially.
    Implements per-page checkpointing and graceful interruption handling.
    """

    def __init__(self):
        self._running = False
        self._current_job_id: Optional[str] = None
        self._shutdown_event = asyncio.Event()
        self._progress_callbacks: Dict[str, ProgressCallback] = {}
        self._callback_timestamps: Dict[str, float] = {}

    def register_progress_callback(self, job_id: str, callback: ProgressCallback):
        """Register a callback for job progress updates."""
        self._progress_callbacks[job_id] = callback
        self._callback_timestamps[job_id] = time.time()
        # Schedule cleanup
        asyncio.create_task(self._cleanup_stale_callbacks())

    def unregister_progress_callback(self, job_id: str):
        """Remove progress callback."""
        self._progress_callbacks.pop(job_id, None)
        self._callback_timestamps.pop(job_id, None)

    async def _cleanup_stale_callbacks(self, max_age_seconds: int = 3600):
        """Remove callbacks older than max_age."""
        current_time = time.time()
        stale_ids = [
            job_id for job_id, ts in self._callback_timestamps.items()
            if current_time - ts > max_age_seconds
        ]
        for job_id in stale_ids:
            self.unregister_progress_callback(job_id)

    async def _notify_progress(
        self,
        job_id: str,
        status: JobStatus,
        phase: int,
        progress: float,
        message: str,
        page_id: Optional[str] = None,
        page_title: Optional[str] = None,
        page_status: Optional[PageStatus] = None,
        total_pages: Optional[int] = None,
        completed_pages: Optional[int] = None,
        failed_pages: Optional[int] = None,
        error: Optional[str] = None
    ):
        """Notify all registered callbacks of progress."""
        callback = self._progress_callbacks.get(job_id)
        if callback:
            try:
                update = JobProgressUpdate(
                    job_id=job_id,
                    status=status,
                    current_phase=phase,
                    progress_percent=progress,
                    message=message,
                    page_id=page_id,
                    page_title=page_title,
                    page_status=page_status,
                    total_pages=total_pages,
                    completed_pages=completed_pages,
                    failed_pages=failed_pages,
                    error=error
                )
                await asyncio.shield(callback(update))
            except Exception as e:
                logger.error(f"Error in progress callback: {e}")

    async def start(self):
        """Start the background worker."""
        if self._running:
            logger.warning("Worker already running")
            return

        self._running = True
        self._shutdown_event.clear()
        logger.info("Background worker started")

        try:
            while self._running and not self._shutdown_event.is_set():
                try:
                    # Get pending jobs
                    pending_jobs = await JobManager.get_pending_jobs()

                    if pending_jobs:
                        job = pending_jobs[0]  # Process oldest first
                        await self._process_job(job)
                    else:
                        # No pending jobs, wait before checking again
                        await asyncio.sleep(5)

                except asyncio.CancelledError:
                    logger.info("Worker cancelled, shutting down gracefully")
                    break
                except Exception as e:
                    logger.error(f"Error in worker loop: {e}")
                    await asyncio.sleep(10)  # Back off on errors

        finally:
            self._running = False
            logger.info("Background worker stopped")

    async def stop(self):
        """Stop the worker gracefully."""
        logger.info("Stopping background worker...")
        self._running = False
        self._shutdown_event.set()

    async def _process_job(self, job: Dict[str, Any]):
        """Process a single wiki generation job."""
        job_id = job['id']
        self._current_job_id = job_id

        try:
            logger.info(f"Processing job {job_id} for {job['owner']}/{job['repo']}")

            # CRITICAL: Double-check job status from database before starting ANY work
            # This prevents race conditions where a job was cancelled between query and processing
            fresh_job = await JobManager.get_job_raw(job_id)
            if not fresh_job:
                logger.warning(f"Job {job_id} no longer exists, skipping")
                return

            current_status = fresh_job.get('status')

            # Check for paused status
            if current_status == JobStatus.PAUSED.value:
                logger.info(f"Job {job_id} is paused, skipping")
                return

            # Check for cancelled status
            if current_status == JobStatus.CANCELLED.value:
                logger.info(f"Job {job_id} is cancelled, skipping")
                return

            # Check if job is already completed or failed
            if current_status in (JobStatus.COMPLETED.value, JobStatus.FAILED.value):
                logger.info(f"Job {job_id} is already {current_status}, skipping")
                return

            # Resume from current phase
            current_phase = job['current_phase']

            # Phase 0: Prepare embeddings (0-10%)
            if current_phase == 0:
                await self._phase_prepare_embeddings(job)

            # Check for shutdown/pause
            if await self._should_stop(job_id):
                return

            # Phase 1: Generate wiki structure (10-50%)
            job = await JobManager.get_job_raw(job_id)
            if job and job['current_phase'] <= 1 and job['status'] != JobStatus.PAUSED.value:
                await self._phase_generate_structure(job)

            # Check for shutdown/pause
            if await self._should_stop(job_id):
                return

            # Phase 2: Generate page content (50-100%)
            job = await JobManager.get_job_raw(job_id)
            if job and job['current_phase'] <= 2 and job['status'] != JobStatus.PAUSED.value:
                await self._phase_generate_pages(job)

            # Determine final status based on failed pages
            job_detail = await JobManager.get_job_detail(job_id)
            if not job_detail:
                logger.error(f"Failed to get job details for {job_id} after completion")
                return

            # Check if there are any failed or permanent_failed pages
            failed_count = job_detail.job.failed_pages
            total_count = job_detail.job.total_pages

            if failed_count > 0:
                # Some pages failed - mark as partially completed
                final_status = JobStatus.PARTIALLY_COMPLETED
                final_message = f"Wiki generation partially completed ({job_detail.job.completed_pages}/{total_count} pages successful, {failed_count} failed)"
                logger.info(f"Job {job_id} completed with {failed_count} failed pages out of {total_count}")
            else:
                # All pages succeeded - mark as completed
                final_status = JobStatus.COMPLETED
                final_message = "Wiki generation completed"
                logger.info(f"Job {job_id} completed successfully with all {total_count} pages")

            # Mark job as completed or partially_completed
            await JobManager.update_job_status(job_id, final_status, phase=2, progress=100.0)

            # Notify final status
            await self._notify_progress(
                job_id, final_status, 2, 100.0,
                final_message,
                total_pages=job_detail.job.total_pages,
                completed_pages=job_detail.job.completed_pages,
                failed_pages=job_detail.job.failed_pages
            )

            # Save to wiki cache for compatibility
            await self._save_to_wiki_cache(job_id)

        except asyncio.CancelledError:
            logger.info(f"Job {job_id} cancelled")
            raise
        except Exception as e:
            logger.error(f"Job {job_id} failed: {e}", exc_info=True)
            # Explicitly update status on unhandled exception
            await JobManager.update_job_status(job_id, JobStatus.FAILED, error=str(e)[:200])
            # Notify failure
            await self._notify_progress(
                job_id, JobStatus.FAILED, job.get('current_phase', 0),
                job.get('progress_percent', 0), f"Failed: {e}", error=str(e)
            )
        finally:
            self._current_job_id = None

    async def _should_stop(self, job_id: str) -> bool:
        """Check if worker should stop processing current job."""
        if self._shutdown_event.is_set():
            logger.info(f"Shutdown requested, pausing job {job_id}")
            return True

        # Check if job was paused or cancelled
        job = await JobManager.get_job_raw(job_id)
        if job:
            if job['status'] == JobStatus.PAUSED.value:
                logger.info(f"Job {job_id} was paused, stopping processing")
                return True
            if job['status'] == JobStatus.CANCELLED.value:
                logger.info(f"Job {job_id} was cancelled, stopping processing")
                return True

        return False

    async def _phase_prepare_embeddings(self, job: Dict[str, Any]):
        """Phase 0: Prepare repository embeddings."""
        job_id = job['id']

        await JobManager.update_job_status(job_id, JobStatus.PREPARING_EMBEDDINGS, phase=0, progress=0.0)
        await self._notify_progress(job_id, JobStatus.PREPARING_EMBEDDINGS, 0, 0.0, "Preparing embeddings...")

        # Parse filter options
        excluded_dirs = json.loads(job['excluded_dirs']) if job['excluded_dirs'] else None
        excluded_files = json.loads(job['excluded_files']) if job['excluded_files'] else None
        included_dirs = json.loads(job['included_dirs']) if job['included_dirs'] else None
        included_files = json.loads(job['included_files']) if job['included_files'] else None

        # Create RAG instance and prepare retriever
        rag = RAG(provider=job['provider'], model=job['model'])

        await self._notify_progress(job_id, JobStatus.PREPARING_EMBEDDINGS, 0, 5.0, "Checking for existing embeddings...")

        # Prepare retriever (will download repo and create/load embeddings)
        # Run in thread pool since this is sync
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(
            None,
            lambda: rag.prepare_retriever(
                job['repo_url'],
                job['repo_type'],
                job['access_token'],
                excluded_dirs,
                excluded_files,
                included_dirs,
                included_files,
                job.get('branch', 'main')
            )
        )

        await JobManager.update_job_status(job_id, JobStatus.PREPARING_EMBEDDINGS, phase=0, progress=10.0)
        await self._notify_progress(job_id, JobStatus.PREPARING_EMBEDDINGS, 0, 10.0, "Embeddings ready")

    async def _phase_generate_structure(self, job: Dict[str, Any]):
        """Phase 1: Generate wiki structure."""
        job_id = job['id']

        await JobManager.update_job_status(job_id, JobStatus.GENERATING_STRUCTURE, phase=1, progress=10.0)
        await self._notify_progress(job_id, JobStatus.GENERATING_STRUCTURE, 1, 10.0, "Generating wiki structure...")

        # Get repository file tree
        file_tree = await self._get_repo_structure(job)

        await self._notify_progress(job_id, JobStatus.GENERATING_STRUCTURE, 1, 20.0, "Analyzing repository...")

        # Generate wiki structure using LLM
        structure_xml = await self._generate_wiki_structure_xml(job, file_tree)

        await self._notify_progress(job_id, JobStatus.GENERATING_STRUCTURE, 1, 40.0, "Parsing wiki structure...")

        # Parse XML to extract pages
        structure, pages = self._parse_wiki_structure(structure_xml, bool(job['is_comprehensive']))

        if not pages:
            raise ValueError("No pages found in wiki structure XML")

        # Save structure and create page records
        await JobManager.set_wiki_structure(job_id, structure, pages)

        await JobManager.update_job_status(job_id, JobStatus.GENERATING_STRUCTURE, phase=1, progress=50.0)
        await self._notify_progress(
            job_id, JobStatus.GENERATING_STRUCTURE, 1, 50.0,
            f"Found {len(pages)} pages to generate",
            total_pages=len(pages)
        )

    async def _phase_generate_pages(self, job: Dict[str, Any]):
        """Phase 2: Generate page content with controlled parallelism."""
        job_id = job['id']

        await JobManager.update_job_status(job_id, JobStatus.GENERATING_PAGES, phase=2, progress=50.0)

        # Reset any pages that might be stuck in IN_PROGRESS from a previous run
        # This handles cases where the worker crashed/restarted while generating a page
        reset_count = await JobManager.reset_stuck_pages(job_id)
        if reset_count > 0:
            logger.info(f"Reset {reset_count} stuck pages to PENDING for job {job_id}")

        # Get total pages count
        job_detail = await JobManager.get_job_detail(job_id)
        if not job_detail:
            raise ValueError(f"Job {job_id} not found")

        total_pages = job_detail.job.total_pages
        completed_count = job_detail.job.completed_pages
        failed_count = job_detail.job.failed_pages

        # Create RAG instance
        rag = RAG(provider=job['provider'], model=job['model'])

        # Prepare retriever
        excluded_dirs = json.loads(job['excluded_dirs']) if job['excluded_dirs'] else None
        excluded_files = json.loads(job['excluded_files']) if job['excluded_files'] else None
        included_dirs = json.loads(job['included_dirs']) if job['included_dirs'] else None
        included_files = json.loads(job['included_files']) if job['included_files'] else None

        loop = asyncio.get_event_loop()
        await loop.run_in_executor(
            None,
            lambda: rag.prepare_retriever(
                job['repo_url'],
                job['repo_type'],
                job['access_token'],
                excluded_dirs,
                excluded_files,
                included_dirs,
                included_files
            )
        )

        # Determine concurrency level
        concurrency = PAGE_CONCURRENCY
        logger.info(f"Starting page generation with concurrency={concurrency} for job {job_id}")

        # Create semaphore for controlled concurrency
        semaphore = asyncio.Semaphore(concurrency)

        # Thread-safe counters for progress tracking
        progress_lock = asyncio.Lock()

        # Process pages with controlled concurrency
        if concurrency == 1:
            # Sequential processing (original behavior)
            await self._process_pages_sequentially(
                job, job_id, rag, total_pages, completed_count, failed_count, progress_lock
            )
        else:
            # Parallel processing
            await self._process_pages_concurrently(
                job, job_id, rag, total_pages, completed_count, failed_count, semaphore, progress_lock
            )

    async def _process_pages_sequentially(
        self, job: Dict[str, Any], job_id: str, rag: RAG,
        total_pages: int, completed_count: int, failed_count: int,
        progress_lock: asyncio.Lock
    ):
        """Process pages one by one (original sequential behavior)."""
        while True:
            # Check for shutdown/pause
            if await self._should_stop(job_id):
                return

            # Get next pending page
            page = await JobManager.get_next_pending_page(job_id)
            if not page:
                # Check for failed pages that can be retried
                failed_pages = await JobManager.get_failed_pages(job_id)
                retryable = [p for p in failed_pages if p['retry_count'] < MAX_PAGE_RETRIES]
                if retryable:
                    page = retryable[0]
                    logger.info(f"Retrying failed page: {page['title']} (attempt {page['retry_count'] + 1})")
                else:
                    break  # All pages processed

            # Mark page as IN_PROGRESS only when actually starting processing
            await JobManager.update_page_status(page['id'], PageStatus.IN_PROGRESS)

            # Calculate progress
            progress = 50.0 + ((completed_count + failed_count) / max(total_pages, 1)) * 50.0
            await self._notify_progress(
                job_id, JobStatus.GENERATING_PAGES, 2, progress,
                f"Generating: {page['title']}",
                page_id=page['id'],
                page_title=page['title'],
                page_status=PageStatus.IN_PROGRESS,
                total_pages=total_pages,
                completed_pages=completed_count,
                failed_pages=failed_count
            )

            # Generate page content
            try:
                success = await asyncio.wait_for(self._generate_page_content(job, page, rag), timeout=600)
            except asyncio.TimeoutError:
                logger.error(f"Page generation timeout for page {page['id']}")
                await JobManager.update_page_status(
                    page['id'], PageStatus.FAILED, error="Page generation timed out (exceeded 10 minutes)"
                )
                success = False

            if success:
                completed_count += 1
            else:
                failed_count += 1
                # Increment failed page count in database
                await JobManager.increment_job_page_count(job_id, failed=True)

            # Update overall progress
            progress = 50.0 + ((completed_count + failed_count) / max(total_pages, 1)) * 50.0
            await JobManager.update_job_status(job_id, JobStatus.GENERATING_PAGES, progress=progress)

    async def _process_pages_concurrently(
        self, job: Dict[str, Any], job_id: str, rag: RAG,
        total_pages: int, completed_count: int, failed_count: int,
        semaphore: asyncio.Semaphore, progress_lock: asyncio.Lock
    ):
        """Process multiple pages in parallel with semaphore-controlled concurrency."""
        # Shared state for concurrent processing
        state = {
            'completed_count': completed_count,
            'failed_count': failed_count,
            'active_tasks': set(),
            'queued_pages': set()  # Track pages already queued to avoid duplicates
        }

        async def process_page_with_semaphore(page: Dict[str, Any]):
            """Process a single page with semaphore control."""
            async with semaphore:
                # Check for shutdown/pause before starting
                if await self._should_stop(job_id):
                    return

                # Mark page as IN_PROGRESS only when actually starting processing
                await JobManager.update_page_status(page['id'], PageStatus.IN_PROGRESS)

                # Notify start
                async with progress_lock:
                    progress = 50.0 + ((state['completed_count'] + state['failed_count']) / max(total_pages, 1)) * 50.0
                    await self._notify_progress(
                        job_id, JobStatus.GENERATING_PAGES, 2, progress,
                        f"Generating: {page['title']}",
                        page_id=page['id'],
                        page_title=page['title'],
                        page_status=PageStatus.IN_PROGRESS,
                        total_pages=total_pages,
                        completed_pages=state['completed_count'],
                        failed_pages=state['failed_count']
                    )

                # Generate page content
                try:
                    success = await asyncio.wait_for(
                        self._generate_page_content(job, page, rag),
                        timeout=600
                    )
                except asyncio.TimeoutError:
                    logger.error(f"Page generation timeout for page {page['id']}")
                    await JobManager.update_page_status(
                        page['id'], PageStatus.FAILED,
                        error="Page generation timed out (exceeded 10 minutes)"
                    )
                    success = False

                # Update counters
                async with progress_lock:
                    if success:
                        state['completed_count'] += 1
                    else:
                        state['failed_count'] += 1
                        # Increment failed page count in database
                        await JobManager.increment_job_page_count(job_id, failed=True)

                    # Update overall progress
                    progress = 50.0 + ((state['completed_count'] + state['failed_count']) / max(total_pages, 1)) * 50.0
                    await JobManager.update_job_status(job_id, JobStatus.GENERATING_PAGES, progress=progress)

        # Main processing loop
        while True:
            # Check for shutdown/pause
            if await self._should_stop(job_id):
                # Wait for active tasks to complete
                if state['active_tasks']:
                    await asyncio.gather(*state['active_tasks'], return_exceptions=True)
                return

            # Get next pending page
            page = await JobManager.get_next_pending_page(job_id)
            if not page:
                # Check for failed pages that can be retried
                failed_pages = await JobManager.get_failed_pages(job_id)
                retryable = [p for p in failed_pages if p['retry_count'] < MAX_PAGE_RETRIES]
                # Filter out pages already queued
                retryable = [p for p in retryable if p['id'] not in state['queued_pages']]
                if retryable:
                    page = retryable[0]
                    logger.info(f"Retrying failed page: {page['title']} (attempt {page['retry_count'] + 1})")
                else:
                    # No more pages, wait for active tasks to complete
                    if state['active_tasks']:
                        await asyncio.gather(*state['active_tasks'], return_exceptions=True)
                    break

            # Check if this page is already queued
            if page['id'] in state['queued_pages']:
                # Skip this page and continue
                await asyncio.sleep(0.1)
                continue

            # Mark page as queued
            state['queued_pages'].add(page['id'])

            # Create task for this page
            task = asyncio.create_task(process_page_with_semaphore(page))
            state['active_tasks'].add(task)

            # Remove task from active and queued sets when done
            task.add_done_callback(lambda t: state['active_tasks'].discard(t))

            # Small delay to prevent tight loop
            await asyncio.sleep(0.1)

    async def _generate_page_content(self, job: Dict[str, Any], page: Dict[str, Any], rag: RAG) -> bool:
        """Generate content for a single page. Returns True if successful."""
        page_id = page['id']
        job_id = job['id']

        start_time = time.time()

        try:
            # Build the generation prompt
            file_paths = json.loads(page['file_paths']) if page['file_paths'] else []
            prompt = self._build_page_generation_prompt(
                job, page['title'], file_paths, job['language']
            )

            # Retrieve context via RAG
            context_text = ""
            try:
                retrieved_docs = rag(page['title'], language=job['language'])
                if retrieved_docs and retrieved_docs[0].documents:
                    docs = retrieved_docs[0].documents
                    docs_by_file = {}
                    for doc in docs:
                        fp = doc.meta_data.get('file_path', 'unknown')
                        if fp not in docs_by_file:
                            docs_by_file[fp] = []
                        docs_by_file[fp].append(doc)

                    context_parts = []
                    for fp, doc_list in docs_by_file.items():
                        header = f"## File Path: {fp}\n\n"
                        content = "\n\n".join([d.text for d in doc_list])
                        context_parts.append(f"{header}{content}")
                    
                    context_text = "\n\n---\n\n".join(context_parts)
                    
                    # Append context to prompt
                    prompt += f"\n\nCONTEXT FROM REPOSITORY:\n\n{context_text}"
            except Exception as e:
                logger.warning(f"RAG retrieval failed for page {page_id}: {e}")
                # Continue without context

            # Generate content using LLM
            # Add timeout to prevent hanging indefinitely
            try:
                # Increase timeout to 10 minutes (600 seconds) for large models/prompts
                content = await asyncio.wait_for(self._call_llm(job, prompt), timeout=600)
            except asyncio.TimeoutError:
                logger.error(f"LLM generation timed out for page {page_id}")
                raise ValueError("LLM generation timeout (exceeded 10 minutes)")

            if not content:
                raise ValueError("Empty response from LLM")

            # Validate and fix Mermaid diagrams
            try:
                content = await self._validate_and_fix_mermaid_diagrams(job, content)
            except Exception as e:
                logger.warning(f"Mermaid diagram validation failed: {e}. Continuing with original content.")

            # Update page with content
            await JobManager.update_page_status(page_id, PageStatus.COMPLETED, content=content)
            
            # Calculate stats
            elapsed_ms = int((time.time() - start_time) * 1000)
            
            # Better token estimation
            try:
                import tiktoken
                # Use cl100k_base (GPT-4) as default approximation
                encoding = tiktoken.get_encoding("cl100k_base")
                tokens = len(encoding.encode(content))
            except ImportError:
                 # Fallback: ~4 chars per token
                 tokens = len(content) // 4
            except Exception as e:
                 logger.warning(f"Token counting error: {e}")
                 # Fallback: ~4 chars per token
                 tokens = len(content) // 4

            await JobManager.increment_job_page_count(
                job_id, completed=True, tokens=tokens
            )

            # Update page stats
            await JobManager.update_page_status(
                page_id,
                PageStatus.COMPLETED,
                tokens=tokens,
                time_ms=elapsed_ms
            )

            logger.info(f"Generated page {page['title']} ({tokens} tokens, {elapsed_ms}ms)")
            return True

        except Exception as e:
            import traceback
            error_detail = f"{e}\n{traceback.format_exc()}"
            logger.error(f"Error generating page {page_id}: {error_detail}")

            # Check retry count
            if page.get('retry_count', 0) >= MAX_PAGE_RETRIES - 1:
                await JobManager.update_page_status(
                    page_id, PageStatus.PERMANENT_FAILED, error=error_detail[:1000]
                )
            else:
                await JobManager.update_page_status(
                    page_id, PageStatus.FAILED, error=error_detail[:1000]
                )
            
            return False

    async def _get_repo_structure(self, job: Dict[str, Any]) -> str:
        """Get repository file tree."""
        repo_url = job['repo_url']
        repo_type = job['repo_type']
        token = job.get('access_token')
        owner = job['owner']
        repo = job['repo']

        file_tree = ""

        try:
            async with aiohttp.ClientSession() as session:
                if repo_type == "github":
                    file_tree = await self._fetch_github_tree(session, owner, repo, token)
                elif repo_type == "gitlab":
                    file_tree = await self._fetch_gitlab_tree(session, owner, repo, token)
                # Add other providers as needed

        except Exception as e:
            logger.error(f"Error getting repo structure: {e}")

        return file_tree

    async def _fetch_github_tree(self, session: aiohttp.ClientSession, owner: str, repo: str, token: Optional[str]) -> str:
        """Fetch file tree from GitHub API."""
        headers = {"Accept": "application/vnd.github.v3+json"}
        if token:
            headers["Authorization"] = f"token {token}"

        # First try to get default branch
        default_branch = "main"
        try:
            repo_info_url = f"https://api.github.com/repos/{owner}/{repo}"
            async with session.get(repo_info_url, headers=headers) as resp:
                if resp.status == 200:
                    repo_data = await resp.json()
                    default_branch = repo_data.get("default_branch", "main")
        except Exception as e:
            logger.debug(f"Failed to fetch repo info: {e}")

        # Try default branch first, then fallbacks
        branches_to_try = [default_branch]
        if default_branch not in ["main", "master"]:
             branches_to_try.extend(["main", "master"])

        for branch in branches_to_try:
            url = f"https://api.github.com/repos/{owner}/{repo}/git/trees/{branch}?recursive=1"
            try:
                async with session.get(url, headers=headers) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        tree = data.get("tree", [])
                        # Format tree as text
                        paths = [item["path"] for item in tree if item.get("type") in ["blob", "tree"]]
                        return "\n".join(paths[:500])  # Limit to 500 items
            except Exception as e:
                logger.debug(f"Failed to fetch tree from branch {branch}: {e}")
                continue

        return ""

    async def _fetch_gitlab_tree(self, session: aiohttp.ClientSession, owner: str, repo: str, token: Optional[str]) -> str:
        """Fetch file tree from GitLab API."""
        headers = {}
        if token:
            headers["PRIVATE-TOKEN"] = token

        # URL encode the project path
        from urllib.parse import quote
        project_path = quote(f"{owner}/{repo}", safe="")
        url = f"https://gitlab.com/api/v4/projects/{project_path}/repository/tree?recursive=true&per_page=100"

        try:
            async with session.get(url, headers=headers) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    paths = [item["path"] for item in data]
                    return "\n".join(paths[:500])
        except Exception as e:
            logger.debug(f"Failed to fetch GitLab tree: {e}")

        return ""

    def _extract_mermaid_diagrams(self, markdown_content: str) -> list[tuple[str, int, int]]:
        """Extract Mermaid diagrams from markdown. Returns list of (diagram_code, start_pos, end_pos)."""
        diagrams = []
        # More flexible pattern: handles optional newlines and whitespace
        pattern = r'```mermaid\s*\n?(.*?)\n?```'

        for match in re.finditer(pattern, markdown_content, re.DOTALL):
            diagram_code = match.group(1).strip()
            if diagram_code:  # Only add non-empty diagrams
                diagrams.append((diagram_code, match.start(), match.end()))

        return diagrams

    def _validate_mermaid_syntax(self, diagram_code: str) -> tuple[bool, str]:
        """Basic Mermaid syntax validation. Returns (is_valid, error_message)."""
        lines = diagram_code.strip().split('\n')

        if not lines:
            return False, "Empty diagram"

        first_line = lines[0].strip()

        # Check for valid diagram types
        valid_types = [
            'graph TD', 'graph LR', 'graph TB', 'graph RL', 'graph BT',
            'sequenceDiagram', 'classDiagram', 'stateDiagram', 'stateDiagram-v2',
            'erDiagram', 'journey', 'gantt', 'pie', 'gitGraph', 'flowchart TD',
            'flowchart LR', 'flowchart TB', 'flowchart RL', 'flowchart BT'
        ]

        if not any(first_line.startswith(t) for t in valid_types):
            return False, f"Invalid diagram type. First line: '{first_line}'"

        # Check for common syntax errors
        for i, line in enumerate(lines, 1):
            line = line.strip()
            if not line or line.startswith('%%'):  # Empty or comment
                continue

            # Check for unmatched brackets
            if line.count('[') != line.count(']'):
                return False, f"Unmatched square brackets on line {i}: '{line}'"
            if line.count('(') != line.count(')'):
                return False, f"Unmatched parentheses on line {i}: '{line}'"
            if line.count('{') != line.count('}'):
                return False, f"Unmatched curly braces on line {i}: '{line}'"

            # Check for invalid arrow syntax in graph diagrams
            if first_line.startswith(('graph', 'flowchart')):
                # Common arrow patterns: -->, --->, -.->, ==>, etc.
                if '--' in line or '==' in line or '-.' in line:
                    # Basic check: arrows should have nodes on both sides
                    arrow_patterns = ['-->', '-.->', '==>', '---', '-.-.', '===']
                    for arrow in arrow_patterns:
                        if arrow in line:
                            parts = line.split(arrow)
                            if len(parts) == 2:
                                left, right = parts
                                # Check that both sides have content
                                if not left.strip() or not right.strip():
                                    return False, f"Invalid arrow syntax on line {i}: missing node"

        # Check for graph TD specifically (required by prompt)
        if first_line.startswith('graph') and 'TD' not in first_line and 'TB' not in first_line:
            logger.warning(f"Graph diagram not using TD/TB orientation: {first_line}")

        return True, ""

    async def _validate_and_fix_mermaid_diagrams(self, job: Dict[str, Any], content: str) -> str:
        """Validate and fix Mermaid diagrams in markdown content."""
        diagrams = self._extract_mermaid_diagrams(content)

        if not diagrams:
            return content  # No diagrams to validate

        logger.info(f"Found {len(diagrams)} Mermaid diagram(s) to validate")

        fixed_content = content
        # Process in reverse order to maintain positions
        for diagram_code, start_pos, end_pos in reversed(diagrams):
            is_valid, error_msg = self._validate_mermaid_syntax(diagram_code)

            if not is_valid:
                logger.warning(f"Invalid Mermaid diagram: {error_msg}")
                logger.debug(f"Problematic diagram:\n{diagram_code[:200]}")

                # Try to fix the diagram using LLM
                try:
                    fix_prompt = f"""The following Mermaid diagram has a syntax error: {error_msg}

Please fix the diagram to make it valid Mermaid syntax. Return ONLY the corrected diagram code, without the ```mermaid wrapper.

REQUIREMENTS:
- Use 'graph TD' for flowcharts (top-down orientation)
- Ensure all brackets are matched: [], (), {{}}
- Ensure proper arrow syntax: A --> B
- Keep it concise and clear

INVALID DIAGRAM:
{diagram_code}

Return ONLY the corrected Mermaid code, no explanations or markdown blocks."""

                    fixed_diagram = await self._call_llm(job, fix_prompt)
                    fixed_diagram = fixed_diagram.strip()

                    # Remove any markdown wrappers the LLM might have added
                    fixed_diagram = re.sub(r'^```mermaid\s*\n?', '', fixed_diagram)
                    fixed_diagram = re.sub(r'\n?```\s*$', '', fixed_diagram)

                    # Validate the fixed version
                    is_valid_fixed, _ = self._validate_mermaid_syntax(fixed_diagram)

                    if is_valid_fixed:
                        logger.info("Successfully fixed Mermaid diagram")
                        # Replace the diagram in content
                        fixed_content = (
                            fixed_content[:start_pos] +
                            f"```mermaid\n{fixed_diagram}\n```" +
                            fixed_content[end_pos:]
                        )
                    else:
                        # If fix failed, remove the diagram
                        logger.warning("Failed to fix Mermaid diagram, removing it")
                        removal_note = "\n\n> **Note:** A diagram was removed due to syntax errors.\n\n"
                        fixed_content = (
                            fixed_content[:start_pos] +
                            removal_note +
                            fixed_content[end_pos:]
                        )

                except Exception as e:
                    logger.error(f"Error fixing Mermaid diagram: {e}")
                    # Remove the problematic diagram
                    logger.warning("Removing problematic Mermaid diagram")
                    removal_note = "\n\n> **Note:** A diagram was removed due to syntax errors.\n\n"
                    fixed_content = (
                        fixed_content[:start_pos] +
                        removal_note +
                        fixed_content[end_pos:]
                    )
            else:
                logger.debug("Mermaid diagram validated successfully")

        return fixed_content

    async def _validate_and_fix_xml(self, job: Dict[str, Any], xml_text: str, attempt: int) -> tuple[str, bool]:
        """Validate XML and attempt to fix if invalid. Returns (xml_text, is_valid)."""
        # Clean up common issues
        xml_text = xml_text.replace("```xml", "").replace("```", "").strip()

        # Extract XML content
        match = re.search(r'<wiki_structure>[\s\S]*?</wiki_structure>', xml_text)
        if not match:
            logger.warning(f"No wiki_structure tag found in XML (attempt {attempt})")
            return xml_text, False

        xml_content = match.group(0)

        # Remove invalid characters
        xml_content = re.sub(r'[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]', '', xml_content)

        # Escape & characters that are not part of an entity
        xml_content = re.sub(r'&(?!(?:amp|lt|gt|apos|quot|#\d+|#x[0-9a-fA-F]+);)', '&amp;', xml_content)

        # Try to parse
        try:
            ET.fromstring(xml_content)
            logger.info(f"XML validation successful (attempt {attempt})")
            return xml_content, True
        except ET.ParseError as e:
            logger.warning(f"XML validation failed (attempt {attempt}): {e}")

            # On retry, ask LLM to fix the XML
            if attempt > 1:
                try:
                    fix_prompt = f"""The following XML structure has a parsing error: {e}

Please fix the XML to make it valid. Return ONLY the corrected XML, no explanations.

INVALID XML:
{xml_content[:2000]}

Return the corrected XML starting with <wiki_structure> and ending with </wiki_structure>.
Do NOT include markdown code blocks or any text before/after the XML."""

                    fixed_xml = await self._call_llm(job, fix_prompt)
                    fixed_xml = fixed_xml.replace("```xml", "").replace("```", "").strip()

                    # Try to validate the fixed version
                    match = re.search(r'<wiki_structure>[\s\S]*?</wiki_structure>', fixed_xml)
                    if match:
                        fixed_content = match.group(0)
                        fixed_content = re.sub(r'[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]', '', fixed_content)
                        fixed_content = re.sub(r'&(?!(?:amp|lt|gt|apos|quot|#\d+|#x[0-9a-fA-F]+);)', '&amp;', fixed_content)

                        ET.fromstring(fixed_content)
                        logger.info(f"XML self-correction successful (attempt {attempt})")
                        return fixed_content, True
                except Exception as fix_error:
                    logger.warning(f"XML self-correction failed (attempt {attempt}): {fix_error}")

            return xml_content, False

    async def _generate_wiki_structure_xml(self, job: Dict[str, Any], file_tree: str) -> str:
        """Generate wiki structure XML using LLM with retry logic."""
        owner = job['owner']
        repo = job['repo']
        language = job['language']
        is_comprehensive = bool(job['is_comprehensive'])

        language_name = "Vietnamese (Tiếng Việt)" if language == 'vi' else "English"

        max_retries = 3
        last_error = None

        # Detect repository type based on file tree
        doc_extensions = {'.md', '.mdx', '.rst', '.adoc', '.tex', '.txt'}
        code_extensions = {'.py', '.js', '.ts', '.jsx', '.tsx', '.java', '.cpp', '.c', '.cs', '.go', '.rb', '.php', '.swift', '.kt', '.rs', '.scala', '.m', '.h', '.sh', '.sql'}
        
        file_lines = [line.strip() for line in file_tree.split('\n') if line.strip()]
        doc_files = sum(1 for line in file_lines if any(line.endswith(ext) for ext in doc_extensions))
        code_files = sum(1 for line in file_lines if any(line.endswith(ext) for ext in code_extensions))
        total_files = max(doc_files + code_files, 1)
        doc_ratio = doc_files / total_files

        # Adaptive analysis instruction based on repository content
        if doc_ratio > 0.6:
            # Documentation-heavy repository (technical docs, SDLC, policy repos)
            analysis_instruction = """Analyze documentation structure and content. Treat documentation files (.md, .rst, .adoc, .tex) as primary source material.
Ignore README.md (often outdated) - focus on actual documentation content.

Tasks:
- Examine documentation organization and hierarchy
- Identify key topics, processes, and information architecture
- Map documentation relationships and dependencies
- Structure wiki based on documentation content
- Use code files (if any) as supplementary context"""
        elif doc_ratio > 0.3:
            # Balanced repository (code + substantial documentation)
            analysis_instruction = """Analyze both code implementation and documentation. Cross-reference for completeness and accuracy.
Ignore README.md (often outdated) - prioritize actual code and structured docs.

Tasks:
- Examine code organization and architecture
- Review structured documentation for design decisions
- Identify components, modules, and their relationships
- Map implemented functionality against documented design
- Structure wiki based on code reality, supplemented by docs where helpful"""
        else:
            # Code-heavy repository
            analysis_instruction = """Analyze source code directly. Ignore README.md (often outdated).

Tasks:
- Examine code organization
- Identify components, modules, relationships
- Map implemented functionality
- Structure wiki based on current code"""

        # Build prompt (ported from frontend)
        if is_comprehensive:
            structure_format = """
GUIDELINES:

Relevant pages:
- Distinct functionality areas/major components
- One cohesive topic per page (e.g., "Authentication System", "Payment API")
- Max one page per major component/module
- Skip pages for missing functionality

If applicable:
- Include section ONLY if matching code/files exist
- Data Management/Flow: If database/storage/state code exists
- Frontend Components: If UI code exists (React, Vue, HTML)
- Model Integration: If AI/ML model code exists
- Omit section if not applicable

Brief description:
- 1-2 sentences, 30-50 words
- Focus on page content, not implementation
- Example: "Explains user auth flow: login, registration, session management."

REQUIRED SECTIONS (if applicable):
- Overview (project info) - ALWAYS REQUIRED
- System Architecture (design) - ALWAYS REQUIRED
- Core Features (key functionality) - ALWAYS REQUIRED
- Data Management/Flow: If database/storage/state code → how data is stored, processed, accessed
- Frontend Components: If UI code → interface elements/pages
- Backend Systems: If server code → server-side components/APIs
- Model Integration: If AI/ML models → integration/usage
- Deployment/Infrastructure: If deployment configs → setup/infrastructure
- Extensibility and Customization: If the project architecture supports it, explain how to extend or customize its functionality (e.g., plugins, theming, custom modules, hooks).

Each section should contain 2-5 relevant pages. For example, the "Frontend Components" section might include pages for "Home Page", "Repository Wiki Page", "Ask Component", etc.

Return your analysis in the following XML format:

<wiki_structure>
  <title>[Overall title for the wiki]</title>
  <description>[Brief description of the repository]</description>
  <sections>
    <section id="section-1">
      <title>[Section title]</title>
      <pages>
        <page_ref>page-1</page_ref>
        <page_ref>page-2</page_ref>
      </pages>
      <subsections>
        <section_ref>section-2</section_ref>
      </subsections>
    </section>
  </sections>
  <pages>
    <page id="page-1">
      <title>[Page title]</title>
      <description>[Brief description of what this page will cover, 1-2 sentences, 30-50 words]</description>
      <importance>high|medium|low</importance>
      <!-- Importance levels:
           high = core functionality, essential to understand the project
           medium = supporting features, important but not critical
           low = optional features, nice-to-have documentation -->
      <relevant_files>
        <file_path>[Path to actual file that exists in the repository]</file_path>
      </relevant_files>
      <related_pages>
        <related>page-2</related>
      </related_pages>
      <parent_section>section-1</parent_section>
    </page>
  </pages>
</wiki_structure>
"""
            page_count = "8-16"
            wiki_type = "comprehensive"
        else:
            structure_format = """
INPUT SPECIFICATION:
You will receive:
1. Repository name: {owner}/{repo}
2. Complete file tree showing all directories and files in the project
3. Target language for wiki content generation

ANALYSIS GUIDELINES:

"Relevant pages" means:
- Pages covering distinct functionality areas or major components
- Each page focuses on one cohesive topic
- Skip creating pages for missing functionality

"Brief description" means:
- 1-2 sentences maximum
- 30-50 words total
- Focus on what the page covers, not implementation details

Return your analysis in the following XML format:

<wiki_structure>
  <title>[Overall title for the wiki]</title>
  <description>[Brief description of the repository]</description>
  <pages>
    <page id="page-1">
      <title>[Page title]</title>
      <description>[Brief description of what this page will cover, 1-2 sentences, 30-50 words]</description>
      <importance>high|medium|low</importance>
      <!-- Importance levels:
           high = core functionality, essential to understand the project
           medium = supporting features, important but not critical
           low = optional features, nice-to-have documentation -->
      <relevant_files>
        <file_path>[Path to actual file that exists in the repository]</file_path>
      </relevant_files>
      <related_pages>
        <related>page-2</related>
      </related_pages>
    </page>
  </pages>
</wiki_structure>
"""
            page_count = "4-8"
            wiki_type = "concise"

        prompt = f"""Analyze {owner}/{repo} and create wiki structure.

File tree:
<file_tree>
{file_tree}
</file_tree>

{analysis_instruction}

I want to create a wiki for this repository. Determine the most logical structure for a wiki based on the repository's content.

IMPORTANT: The wiki content will be generated in {language_name} language.

When designing the wiki structure, include pages that would benefit from visual diagrams, such as:

- Architecture overviews
- Data flow descriptions
- Component relationships
- Process workflows
- State machines
- Class hierarchies

{structure_format}

IMPORTANT FORMATTING INSTRUCTIONS:
- Return ONLY the valid XML structure specified above
- DO NOT wrap the XML in markdown code blocks (no ``` or ```xml)
- DO NOT include any explanation text before or after the XML
- Ensure the XML is properly formatted and valid
- Start directly with <wiki_structure> and end with </wiki_structure>

IMPORTANT:
1. Create {page_count} pages that would make a {wiki_type} wiki for this repository
2. Each page should focus on a specific aspect of the codebase (e.g., architecture, key features, setup)
3. The relevant_files should be actual files from the repository that would be used to generate that page
4. Return ONLY valid XML with the structure specified above, with no markdown code block delimiters"""

        # Retry loop with validation
        for attempt in range(1, max_retries + 1):
            try:
                logger.info(f"Generating wiki structure XML (attempt {attempt}/{max_retries})")

                # Add retry-specific guidance to prompt
                if attempt > 1:
                    retry_note = f"\n\nIMPORTANT: Previous attempt failed with error: {last_error}. Please ensure the XML is valid and well-formed."
                    current_prompt = prompt + retry_note
                else:
                    current_prompt = prompt

                # Generate XML from LLM
                response = await self._call_llm(job, current_prompt)

                # Validate and fix if needed
                validated_xml, is_valid = await self._validate_and_fix_xml(job, response, attempt)

                if is_valid:
                    logger.info(f"Successfully generated valid wiki structure XML (attempt {attempt})")
                    return validated_xml
                else:
                    last_error = "Invalid XML structure"
                    logger.warning(f"XML validation failed on attempt {attempt}/{max_retries}")

                    # Wait before retry (exponential backoff)
                    if attempt < max_retries:
                        wait_time = 2 ** attempt  # 2s, 4s, 8s
                        logger.info(f"Waiting {wait_time}s before retry...")
                        await asyncio.sleep(wait_time)

            except Exception as e:
                last_error = str(e)
                logger.error(f"Error generating wiki structure XML (attempt {attempt}/{max_retries}): {e}")

                if attempt < max_retries:
                    wait_time = 2 ** attempt
                    logger.info(f"Waiting {wait_time}s before retry...")
                    await asyncio.sleep(wait_time)
                else:
                    raise ValueError(f"Failed to generate valid wiki structure XML after {max_retries} attempts: {last_error}")

        # If we get here, all retries failed
        raise ValueError(f"Failed to generate valid wiki structure XML after {max_retries} attempts: {last_error}")

    def _parse_wiki_structure(self, xml_text: str, is_comprehensive: bool) -> tuple:
        """Parse wiki structure XML into structure dict and pages list.

        Note: XML validation should be done before calling this method using _validate_and_fix_xml.
        """
        structure = {
            "id": "wiki",
            "title": "",
            "description": "",
            "pages": [],
            "sections": [],
            "rootSections": []
        }
        pages = []

        try:
            # XML should already be validated, just parse it
            # The xml_text at this point should be clean and valid
            root = ET.fromstring(xml_text)

            # Extract title and description
            title_el = root.find("title")
            structure["title"] = title_el.text if title_el is not None and title_el.text else ""

            desc_el = root.find("description")
            structure["description"] = desc_el.text if desc_el is not None and desc_el.text else ""

            # Parse pages
            for page_el in root.findall(".//page"):
                page_id = page_el.get("id", f"page-{len(pages)+1}")

                title_el = page_el.find("title")
                desc_el = page_el.find("description")
                importance_el = page_el.find("importance")
                parent_section_el = page_el.find("parent_section")

                file_paths = [fp.text for fp in page_el.findall(".//file_path") if fp.text]
                related = [r.text for r in page_el.findall(".//related") if r.text]

                page = {
                    "id": page_id,
                    "title": title_el.text if title_el is not None and title_el.text else "",
                    "description": desc_el.text if desc_el is not None and desc_el.text else "",
                    "importance": importance_el.text if importance_el is not None and importance_el.text else "medium",
                    "file_paths": file_paths,
                    "related_pages": related,
                    "parent_section": parent_section_el.text if parent_section_el is not None else None
                }
                pages.append(page)

            # Parse sections for comprehensive view
            if is_comprehensive:
                for section_el in root.findall(".//section"):
                    section_id = section_el.get("id")
                    title_el = section_el.find("title")
                    page_refs = [pr.text for pr in section_el.findall(".//page_ref") if pr.text]
                    subsection_refs = [sr.text for sr in section_el.findall(".//section_ref") if sr.text]

                    section = {
                        "id": section_id,
                        "title": title_el.text if title_el is not None and title_el.text else "",
                        "pages": page_refs,
                        "subsections": subsection_refs if subsection_refs else None
                    }
                    structure["sections"].append(section)

                # Determine root sections (sections not referenced by other sections)
                all_subsections = set()
                for s in structure["sections"]:
                    if s.get("subsections"):
                        all_subsections.update(s["subsections"])

                structure["rootSections"] = [
                    s["id"] for s in structure["sections"]
                    if s["id"] not in all_subsections
                ]

            logger.info(f"Parsed wiki structure: {len(pages)} pages, {len(structure.get('sections', []))} sections")

        except ET.ParseError as e:
            # This should not happen since XML is validated before this method is called
            logger.error(f"Unexpected XML parsing error (XML should be pre-validated): {e}")
            logger.error(f"Problematic XML content (first 500 chars): {xml_text[:500]}")
            raise ValueError(f"Failed to parse pre-validated XML: {e}")
        except Exception as e:
            logger.error(f"Error parsing wiki structure: {e}")
            raise

        return structure, pages

    def _build_page_generation_prompt(
        self,
        job: Dict[str, Any],
        title: str,
        file_paths: List[str],
        language: str
    ) -> str:
        """Build the prompt for generating page content."""
        language_name = "Vietnamese (Tiếng Việt)" if language == 'vi' else "English"
        file_paths_str = '\n'.join(f'- {fp}' for fp in file_paths) if file_paths else '- No specific files provided'

        prompt = f"""You are a senior software architect (10+ years experience) and technical writer.
Your task is to generate a clear, comprehensive, and actionable technical wiki page in Markdown about a specific feature, system, or module in this project.

You will be given:
1. The "[WIKI_PAGE_TOPIC]" for the page you need to create.
2. A list of "[RELEVANT_SOURCE_FILES]" from the project that you MUST use as the sole basis for the content.

[WIKI_PAGE_TOPIC]: {title}
[RELEVANT_SOURCE_FILES]:
{file_paths_str}

Override: Absolute, Concise

Language Style:
- Plain, direct words only. No corporate/academic buzzwords.
- Banned: comprehensive, robust, leverage, utilize, facilitate, seamless, cutting-edge, holistic, synergy, streamline.
- Use instead: "use" not "utilize", "complete" not "comprehensive", "strong" not "robust".

CRITICAL STARTING INSTRUCTION:
The very first thing on the page MUST be a `<details>` block listing ALL the `[RELEVANT_SOURCE_FILES]` you used to generate the content.
Format it exactly like this:
<details>
<summary>Relevant source files</summary>

The following files were used as context for generating this wiki page:

{file_paths_str}
</details>

Immediately after the `<details>` block, add the H1 title: `# {title}`.

Quality Standards:
- Multi-dimensional analysis: Functional behavior, Architectural design, Implementation details, Operational concerns, and Evolution/maintainability.
- Production-ready insights: performance, scalability, security, reliability/fault tolerance, and observability.
- Explain design decisions and trade-offs grounded in the source files.
- Make it actionable: specific guidance to use, extend, and safely modify the code.

Based ONLY on the content of the `[RELEVANT_SOURCE_FILES]`:

1.  **Introduction:** Start with a concise introduction (1-2 paragraphs) explaining the purpose, scope, and high-level overview of "{title}" within the context of the overall project.

2.  **Detailed Sections:** Break down "{title}" into logical sections using H2 (`##`) and H3 (`###`) Markdown headings. For each section:
    *   Explain the architecture, components, data flow, or logic relevant to the section's focus.
    *   Identify key functions, classes, data structures, API endpoints, or configuration elements.

3.  **Mermaid Diagrams (when essential):**
    *   Include at most 1–2 diagrams (e.g., `graph TD`, `sequenceDiagram`, `classDiagram`) only if they materially improve clarity.
    *   Keep diagrams concise; CRITICAL: follow strict top-down orientation with "graph TD" directive.

4.  **Tables:**
    *   Use Markdown tables to summarize information such as key features, API parameters, configuration options.

5.  **Code Snippets (optional):**
    *   Include short, focused snippets from the `[RELEVANT_SOURCE_FILES]` to illustrate key details.

6.  **Source Citations (EXTREMELY IMPORTANT):**
    *   For EVERY piece of significant information, you MUST cite the specific source file(s) and relevant line numbers.
    *   Use the format: `Sources: [filename.ext:start_line-end_line]()`

7.  **Technical Accuracy:** All information must be derived SOLELY from the `[RELEVANT_SOURCE_FILES]`.

8.  **Clarity and Conciseness:** Use clear, professional, and concise technical language.

9.  **Conclusion/Summary:** End with a brief summary paragraph if appropriate.

IMPORTANT: Generate the content in {language_name}."""

        return prompt

    async def _call_llm(self, job: Dict[str, Any], prompt: str) -> str:
        """Call LLM to generate content."""
        provider = job['provider']
        model = job['model']

        model_config = get_model_config(provider, model)["model_kwargs"]
        content = ""

        try:
            if provider == "ollama":
                prompt = f"/no_think {prompt}"
                client = OllamaClient()
                model_kwargs = {
                    "model": model_config["model"],
                    "stream": True,
                    "options": {
                        "temperature": model_config["temperature"],
                        "top_p": model_config["top_p"],
                        "num_ctx": model_config["num_ctx"]
                    }
                }
                api_kwargs = client.convert_inputs_to_api_kwargs(
                    input=prompt,
                    model_kwargs=model_kwargs,
                    model_type=ModelType.LLM
                )
                response = await client.acall(api_kwargs=api_kwargs, model_type=ModelType.LLM)
                async for chunk in response:
                    text = getattr(chunk, 'response', None) or getattr(chunk, 'text', None) or str(chunk)
                    if text and not text.startswith('model=') and not text.startswith('created_at='):
                        text = text.replace('<think>', '').replace('</think>', '')
                        content += text

            elif provider == "openrouter":
                if not OPENROUTER_API_KEY:
                    raise ValueError("OPENROUTER_API_KEY not configured")

                client = OpenRouterClient()
                model_kwargs = {
                    "model": model,
                    "stream": True,
                    "temperature": model_config["temperature"]
                }
                if "top_p" in model_config:
                    model_kwargs["top_p"] = model_config["top_p"]

                api_kwargs = client.convert_inputs_to_api_kwargs(
                    input=prompt,
                    model_kwargs=model_kwargs,
                    model_type=ModelType.LLM
                )
                response = await client.acall(api_kwargs=api_kwargs, model_type=ModelType.LLM)
                async for chunk in response:
                    content += chunk

            elif provider == "azure":
                if not os.getenv("AZURE_OPENAI_API_KEY"):
                    raise ValueError("AZURE_OPENAI_API_KEY not configured")

                client = AzureAIClient()
                model_kwargs = {
                    "model": model,
                    "stream": True,
                    "temperature": model_config["temperature"]
                }
                if "top_p" in model_config:
                    model_kwargs["top_p"] = model_config["top_p"]

                api_kwargs = client.convert_inputs_to_api_kwargs(
                    input=prompt,
                    model_kwargs=model_kwargs,
                    model_type=ModelType.LLM
                )
                response = await client.acall(api_kwargs=api_kwargs, model_type=ModelType.LLM)
                async for chunk in response:
                    choices = getattr(chunk, "choices", [])
                    if len(choices) > 0:
                        delta = getattr(choices[0], "delta", None)
                        if delta is not None:
                            text = getattr(delta, "content", None)
                            if text is not None:
                                content += text

            elif provider == "openai":
                if not OPENAI_API_KEY:
                    raise ValueError("OPENAI_API_KEY not configured")

                client = OpenAIClient()
                model_kwargs = {
                    "model": model,
                    "stream": True,
                    "temperature": model_config["temperature"]
                }
                if "top_p" in model_config:
                    model_kwargs["top_p"] = model_config["top_p"]

                api_kwargs = client.convert_inputs_to_api_kwargs(
                    input=prompt,
                    model_kwargs=model_kwargs,
                    model_type=ModelType.LLM
                )
                response = await client.acall(api_kwargs=api_kwargs, model_type=ModelType.LLM)
                async for chunk in response:
                    choices = getattr(chunk, "choices", [])
                    if len(choices) > 0:
                        delta = getattr(choices[0], "delta", None)
                        if delta is not None:
                            text = getattr(delta, "content", None)
                            if text is not None:
                                content += text

            elif provider == "deepseek":
                if not DEEPSEEK_API_KEY:
                    raise ValueError("DEEPSEEK_API_KEY not configured")

                client = DeepSeekClient()
                model_kwargs = {
                    "model": model,
                    "stream": True,
                    "temperature": model_config["temperature"]
                }
                if "top_p" in model_config:
                    model_kwargs["top_p"] = model_config["top_p"]

                api_kwargs = client.convert_inputs_to_api_kwargs(
                    input=prompt,
                    model_kwargs=model_kwargs,
                    model_type=ModelType.LLM
                )
                response = await client.acall(api_kwargs=api_kwargs, model_type=ModelType.LLM)
                async for chunk in response:
                    choices = getattr(chunk, "choices", [])
                    if len(choices) > 0:
                        delta = getattr(choices[0], "delta", None)
                        if delta is not None:
                            text = getattr(delta, "content", None)
                            if text is not None:
                                content += text

            else:  # Google (default)
                google_model = genai.GenerativeModel(
                    model_name=model_config["model"],
                    generation_config={
                        "temperature": model_config["temperature"],
                        "top_p": model_config["top_p"],
                        "top_k": model_config["top_k"]
                    }
                )
                # Google SDK sync call, run in executor
                loop = asyncio.get_event_loop()
                
                def run_google_generation():
                    response = google_model.generate_content(prompt, stream=True)
                    text_result = ""
                    for chunk in response:
                        if hasattr(chunk, 'text'):
                            text_result += chunk.text
                    return text_result

                content = await loop.run_in_executor(None, run_google_generation)

        except Exception as e:
            logger.error(f"LLM call failed: {e}")
            raise

        return content

    async def _save_to_wiki_cache(self, job_id: str):
        """Save completed wiki to cache for backward compatibility."""
        job_detail = await JobManager.get_job_detail(job_id)
        if not job_detail or job_detail.job.status != JobStatus.COMPLETED:
            return

        try:
            from adalflow.utils import get_adalflow_default_root_path

            # Build wiki cache structure
            generated_pages = {}
            for page in job_detail.pages:
                if page.status == PageStatus.COMPLETED:
                    generated_pages[page.page_id] = {
                        "id": page.page_id,
                        "title": page.title,
                        "content": page.content or "",
                        "filePaths": page.file_paths,
                        "importance": page.importance,
                        "relatedPages": page.related_pages
                    }

            # Build wiki structure for cache
            wiki_structure = job_detail.wiki_structure or {}
            wiki_structure["pages"] = [
                {
                    "id": page.page_id,
                    "title": page.title,
                    "content": page.content or "",
                    "filePaths": page.file_paths,
                    "importance": page.importance,
                    "relatedPages": page.related_pages
                }
                for page in job_detail.pages
                if page.status == PageStatus.COMPLETED
            ]

            cache_data = {
                "wiki_structure": wiki_structure,
                "generated_pages": generated_pages,
                "repo": {
                    "owner": job_detail.job.owner,
                    "repo": job_detail.job.repo,
                    "type": job_detail.job.repo_type,
                    "repoUrl": job_detail.job.repo_url
                },
                "provider": job_detail.job.provider,
                "model": job_detail.job.model
            }

            # Save to wiki cache directory
            cache_dir = os.path.join(get_adalflow_default_root_path(), "wikicache")
            os.makedirs(cache_dir, exist_ok=True)

            cache_filename = f"deepwiki_cache_{job_detail.job.repo_type}_{job_detail.job.owner}_{job_detail.job.repo}_{job_detail.job.language}.json"
            cache_path = os.path.join(cache_dir, cache_filename)

            with open(cache_path, 'w', encoding='utf-8') as f:
                json.dump(cache_data, f, indent=2)

            logger.info(f"Saved wiki cache for job {job_id} at {cache_path}")

        except Exception as e:
            logger.error(f"Failed to save wiki cache: {e}")


# Global worker instance
_worker: Optional['WikiGenerationWorker'] = None
_worker_task: Optional[asyncio.Task] = None
_worker_lock = asyncio.Lock()


async def get_worker() -> 'WikiGenerationWorker':
    """Get the global worker instance."""
    global _worker
    async with _worker_lock:
        if _worker is None:
            _worker = WikiGenerationWorker()
    return _worker


async def start_worker():
    """Start the background worker."""
    global _worker_task
    worker = await get_worker()

    # Initialize database
    await get_db()

    # Start worker in background task
    _worker_task = asyncio.create_task(worker.start())
    logger.info("Background worker task created")


async def stop_worker():
    """Stop the background worker."""
    global _worker, _worker_task

    if _worker:
        await _worker.stop()

    if _worker_task:
        _worker_task.cancel()
        try:
            await _worker_task
        except asyncio.CancelledError:
            pass

    logger.info("Background worker stopped")
