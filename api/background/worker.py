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
from xml.dom.minidom import parseString
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
from api.azure_anthropic_client import AzureAnthropicClient
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

        # Track chunking/embedding tokens
        from api.background.token_tracker import TokenTracker
        await TokenTracker.initialize_job_tokens(job_id)

        # Get chunking stats from RAG
        stats = rag.get_chunking_stats()
        await TokenTracker.update_chunking_tokens(
            job_id,
            stats['total_tokens'],
            stats['total_chunks']
        )
        logger.info(f"Job {job_id}: {stats['total_chunks']} chunks, {stats['total_tokens']} tokens")

        await JobManager.update_job_status(job_id, JobStatus.PREPARING_EMBEDDINGS, phase=0, progress=10.0)
        await self._notify_progress(job_id, JobStatus.PREPARING_EMBEDDINGS, 0, 10.0, "Embeddings ready")

    async def _phase_generate_structure(self, job: Dict[str, Any]):
        """Phase 1: Generate wiki structure."""
        job_id = job['id']

        await JobManager.update_job_status(job_id, JobStatus.GENERATING_STRUCTURE, phase=1, progress=10.0)
        await self._notify_progress(job_id, JobStatus.GENERATING_STRUCTURE, 1, 10.0, "Generating wiki structure...")

        # Get repository file tree and README
        file_tree, readme = await self._get_repo_structure(job)

        await self._notify_progress(job_id, JobStatus.GENERATING_STRUCTURE, 1, 20.0, "Analyzing repository...")

        # Generate wiki structure using LLM
        structure_xml = await self._generate_wiki_structure_xml(job, file_tree, readme)

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

            # Update page with content
            await JobManager.update_page_status(page_id, PageStatus.COMPLETED, content=content)
            
            # Calculate stats
            elapsed_ms = int((time.time() - start_time) * 1000)
            
            # Better token estimation
            try:
                import tiktoken
                # Use cl100k_base (GPT-4) as default approximation
                encoding = tiktoken.get_encoding("cl100k_base")
                completion_tokens = len(encoding.encode(content))
                prompt_tokens = len(encoding.encode(prompt))
            except ImportError:
                 # Fallback: ~4 chars per token
                 completion_tokens = len(content) // 4
                 prompt_tokens = len(prompt) // 4
            except Exception as e:
                 logger.warning(f"Token counting error: {e}")
                 # Fallback: ~4 chars per token
                 completion_tokens = len(content) // 4
                 prompt_tokens = len(prompt) // 4

            tokens = completion_tokens  # For backward compatibility

            # Track provider tokens
            from api.background.token_tracker import TokenTracker
            await TokenTracker.update_provider_tokens(
                job_id,
                prompt_tokens,
                completion_tokens
            )

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

    async def _get_repo_structure(self, job: Dict[str, Any]) -> tuple:
        """Get repository file tree and README content."""
        repo_url = job['repo_url']
        repo_type = job['repo_type']
        token = job.get('access_token')
        owner = job['owner']
        repo = job['repo']

        file_tree = ""
        readme = ""

        try:
            async with aiohttp.ClientSession() as session:
                if repo_type == "github":
                    file_tree = await self._fetch_github_tree(session, owner, repo, token)
                    readme = await self._fetch_github_readme(session, owner, repo, token)
                elif repo_type == "gitlab":
                    file_tree = await self._fetch_gitlab_tree(session, owner, repo, token)
                    readme = await self._fetch_gitlab_readme(session, owner, repo, token)
                # Add other providers as needed

        except Exception as e:
            logger.error(f"Error getting repo structure: {e}")

        return file_tree, readme

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

    async def _fetch_github_readme(self, session: aiohttp.ClientSession, owner: str, repo: str, token: Optional[str]) -> str:
        """Fetch README from GitHub API."""
        headers = {"Accept": "application/vnd.github.v3+json"}
        if token:
            headers["Authorization"] = f"token {token}"

        url = f"https://api.github.com/repos/{owner}/{repo}/readme"
        try:
            async with session.get(url, headers=headers) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    content = data.get("content", "")
                    if content:
                        import base64
                        return base64.b64decode(content).decode("utf-8", errors="ignore")
        except Exception as e:
            logger.debug(f"Failed to fetch README: {e}")

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

    async def _fetch_gitlab_readme(self, session: aiohttp.ClientSession, owner: str, repo: str, token: Optional[str]) -> str:
        """Fetch README from GitLab API."""
        headers = {}
        if token:
            headers["PRIVATE-TOKEN"] = token

        from urllib.parse import quote
        project_path = quote(f"{owner}/{repo}", safe="")

        for readme_file in ["README.md", "readme.md", "README", "README.txt"]:
            file_path = quote(readme_file, safe="")
            url = f"https://gitlab.com/api/v4/projects/{project_path}/repository/files/{file_path}/raw?ref=main"

            try:
                async with session.get(url, headers=headers) as resp:
                    if resp.status == 200:
                        return await resp.text()
            except Exception:
                continue

        return ""

    async def _generate_wiki_structure_xml(self, job: Dict[str, Any], file_tree: str, readme: str) -> str:
        """Generate wiki structure XML using LLM."""
        owner = job['owner']
        repo = job['repo']
        language = job['language']
        is_comprehensive = bool(job['is_comprehensive'])

        language_name = "Vietnamese (Tiếng Việt)" if language == 'vi' else "English"

        # Build prompt (ported from frontend)
        if is_comprehensive:
            structure_format = """
Create a structured wiki with the following main sections:
- Overview (general information about the project)
- System Architecture (how the system is designed)
- Core Features (key functionality)
- Data Management/Flow: If applicable, how data is stored, processed, accessed, and managed (e.g., database schema, data pipelines, state management).
- Frontend Components (UI elements, if applicable.)
- Backend Systems (server-side components)
- Model Integration (AI model connections)
- Deployment/Infrastructure (how to deploy, what's the infrastructure like)
- Extensibility and Customization: If the project architecture supports it, explain how to extend or customize its functionality (e.g., plugins, theming, custom modules, hooks).

Each section should contain relevant pages. For example, the "Frontend Components" section might include pages for "Home Page", "Repository Wiki Page", "Ask Component", etc.

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
      <description>[Brief description of what this page will cover]</description>
      <importance>high|medium|low</importance>
      <relevant_files>
        <file_path>[Path to a relevant file]</file_path>
      </relevant_files>
      <related_pages>
        <related>page-2</related>
      </related_pages>
      <parent_section>section-1</parent_section>
    </page>
  </pages>
</wiki_structure>
"""
            page_count = "8-12"
            wiki_type = "comprehensive"
        else:
            structure_format = """
Return your analysis in the following XML format:

<wiki_structure>
  <title>[Overall title for the wiki]</title>
  <description>[Brief description of the repository]</description>
  <pages>
    <page id="page-1">
      <title>[Page title]</title>
      <description>[Brief description of what this page will cover]</description>
      <importance>high|medium|low</importance>
      <relevant_files>
        <file_path>[Path to a relevant file]</file_path>
      </relevant_files>
      <related_pages>
        <related>page-2</related>
      </related_pages>
    </page>
  </pages>
</wiki_structure>
"""
            page_count = "4-6"
            wiki_type = "concise"

        prompt = f"""Analyze this GitHub repository {owner}/{repo} and create a wiki structure for it.

1. The complete file tree of the project:
<file_tree>
{file_tree}
</file_tree>

2. The README file of the project (Note: This README is for reference only; doubt its accuracy and maintenance, so do not use it as the primary source):
<readme>
{readme}
</readme>

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

        response = await self._call_llm(job, prompt)

        # Clean up response
        response = response.replace("```xml", "").replace("```", "").strip()

        return response

    def _validate_and_fix_wiki_structure_xml(self, content: str) -> str:
        """Validate and fix wiki_structure XML content.

        This method ensures the XML is properly formatted and valid by:
        1. Extracting the wiki_structure XML
        2. Validating it can be parsed
        3. Attempting to rebuild it if validation fails

        Args:
            content: Raw content from LLM that may contain wiki_structure XML

        Returns:
            Validated/fixed XML content, or original content if not wiki_structure XML
        """
        # First, remove markdown code blocks if present
        cleaned_content = content.strip()
        if cleaned_content.startswith("```xml"):
            cleaned_content = cleaned_content.replace("```xml", "", 1).strip()
        if cleaned_content.startswith("```"):
            cleaned_content = cleaned_content.replace("```", "", 1).strip()
        if cleaned_content.endswith("```"):
            cleaned_content = cleaned_content.rsplit("```", 1)[0].strip()

        # Check if it's likely XML
        if not (cleaned_content.startswith("<") and ">" in cleaned_content):
            logger.debug("Content doesn't appear to be XML")
            return content

        # Check if it's a wiki_structure XML
        if "<wiki_structure>" not in cleaned_content:
            logger.debug("Content doesn't contain wiki_structure tag")
            return content

        # Use cleaned content from here on
        content = cleaned_content

        logger.info("Found wiki_structure XML, ensuring proper format")

        # Extract just the wiki_structure XML
        wiki_match = re.search(r'<wiki_structure>[\s\S]*?</wiki_structure>', content)
        if not wiki_match:
            logger.warning("Could not extract wiki_structure XML with regex")
            if "</wiki_structure>" not in content:
                logger.error("Closing tag </wiki_structure> is MISSING! XML is incomplete - response may have been truncated")
            # Return the cleaned content anyway (without markdown blocks)
            return content

        # Get the raw XML
        raw_xml = wiki_match.group(0)

        # Clean the XML by removing any leading/trailing whitespace
        clean_xml = raw_xml.strip()

        # Try to fix common XML issues
        try:
            # Replace problematic characters in XML
            fixed_xml = clean_xml

            # Replace & with &amp; if not already part of an entity
            fixed_xml = re.sub(r'&(?!amp;|lt;|gt;|apos;|quot;)', '&amp;', fixed_xml)

            # Fix other common XML issues
            fixed_xml = fixed_xml.replace('</', '</').replace('  >', '>')

            # Try to parse the fixed XML
            dom = parseString(fixed_xml)

            # Get the pretty-printed XML with proper indentation
            pretty_xml = dom.toprettyxml()

            # Remove XML declaration
            if pretty_xml.startswith('<?xml'):
                pretty_xml = pretty_xml[pretty_xml.find('?>')+2:].strip()

            logger.info("Successfully validated and formatted XML")
            return pretty_xml

        except Exception as xml_parse_error:
            logger.warning(f"XML validation failed: {str(xml_parse_error)}, attempting to rebuild")

            # If XML validation fails, try a more aggressive approach
            try:
                # Use regex to extract just the structure without any problematic characters

                # Extract the basic structure
                structure_match = re.search(r'<wiki_structure>(.*?)</wiki_structure>', clean_xml, re.DOTALL)
                if not structure_match:
                    logger.warning("Could not extract wiki_structure content")
                    return clean_xml

                structure = structure_match.group(1).strip()

                # Rebuild a clean XML structure
                clean_structure = "<wiki_structure>\n"

                # Extract title
                title_match = re.search(r'<title>(.*?)</title>', structure, re.DOTALL)
                if title_match:
                    title = title_match.group(1).strip()
                    # Escape XML special characters
                    title = title.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
                    clean_structure += f"  <title>{title}</title>\n"

                # Extract description
                desc_match = re.search(r'<description>(.*?)</description>', structure, re.DOTALL)
                if desc_match:
                    desc = desc_match.group(1).strip()
                    # Escape XML special characters
                    desc = desc.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
                    clean_structure += f"  <description>{desc}</description>\n"

                # Add pages section
                clean_structure += "  <pages>\n"

                # Extract pages
                pages = re.findall(r'<page id="(.*?)">(.*?)</page>', structure, re.DOTALL)
                for page_id, page_content in pages:
                    # Escape page_id
                    page_id = page_id.replace('&', '&amp;').replace('"', '&quot;')
                    clean_structure += f'    <page id="{page_id}">\n'

                    # Extract page title
                    page_title_match = re.search(r'<title>(.*?)</title>', page_content, re.DOTALL)
                    if page_title_match:
                        page_title = page_title_match.group(1).strip()
                        page_title = page_title.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
                        clean_structure += f"      <title>{page_title}</title>\n"

                    # Extract page description
                    page_desc_match = re.search(r'<description>(.*?)</description>', page_content, re.DOTALL)
                    if page_desc_match:
                        page_desc = page_desc_match.group(1).strip()
                        page_desc = page_desc.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
                        clean_structure += f"      <description>{page_desc}</description>\n"

                    # Extract importance
                    importance_match = re.search(r'<importance>(.*?)</importance>', page_content, re.DOTALL)
                    if importance_match:
                        importance = importance_match.group(1).strip()
                        clean_structure += f"      <importance>{importance}</importance>\n"

                    # Extract relevant files
                    clean_structure += "      <relevant_files>\n"
                    file_paths = re.findall(r'<file_path>(.*?)</file_path>', page_content, re.DOTALL)
                    for file_path in file_paths:
                        file_path = file_path.strip().replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
                        clean_structure += f"        <file_path>{file_path}</file_path>\n"
                    clean_structure += "      </relevant_files>\n"

                    # Extract related pages
                    clean_structure += "      <related_pages>\n"
                    related_pages = re.findall(r'<related>(.*?)</related>', page_content, re.DOTALL)
                    for related in related_pages:
                        related = related.strip()
                        clean_structure += f"        <related>{related}</related>\n"
                    clean_structure += "      </related_pages>\n"

                    clean_structure += "    </page>\n"

                clean_structure += "  </pages>\n</wiki_structure>"

                logger.info("Successfully rebuilt clean XML structure")
                return clean_structure

            except Exception as rebuild_error:
                logger.warning(f"Failed to rebuild XML: {str(rebuild_error)}, using raw XML")
                return clean_xml

    def _parse_wiki_structure(self, xml_text: str, is_comprehensive: bool) -> tuple:
        """Parse wiki structure XML into structure dict and pages list."""
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
            # Extract XML content
            match = re.search(r'<wiki_structure>[\s\S]*?</wiki_structure>', xml_text)
            if not match:
                logger.error("No wiki_structure tag found in XML")
                return structure, pages

            xml_content = match.group(0)
            # Remove invalid characters
            xml_content = re.sub(r'[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]', '', xml_content)
            
            # Escape & characters that are not part of an entity
            xml_content = re.sub(r'&(?!(?:amp|lt|gt|apos|quot|#\d+|#x[0-9a-fA-F]+);)', '&amp;', xml_content)

            try:
                root = ET.fromstring(xml_content)
            except ET.ParseError as e:
                logger.error(f"Error parsing wiki structure XML: {e}")
                logger.error(f"Problematic XML content (first 500 chars): {xml_content[:500]}")
                
                # Attempt fallback: try to wrap content in a root tag if missing or recover from simple errors
                try:
                    # Sometimes the root tag might be malformed or missing attributes causing issues
                    # Let's try to re-parse with a cleaner approach if possible, or just raise
                    # For now, we'll try to wrap in a dummy root if it looks like a fragment
                    if not xml_content.strip().startswith('<wiki_structure>'):
                         root = ET.fromstring(f"<wiki_structure>{xml_content}</wiki_structure>")
                    else:
                        raise ValueError(f"Invalid wiki structure XML: {e}")
                except Exception:
                     raise ValueError(f"Invalid wiki structure XML: {e}")

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
            logger.error(f"Error parsing wiki structure XML: {e}")
            if 'xml_content' in locals():
                logger.error(f"Problematic XML content (first 500 chars): {xml_content[:500]}")

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

            elif provider == "azure_anthropic":
                if not os.getenv("AZURE_ANTHROPIC_API_KEY"):
                    raise ValueError("AZURE_ANTHROPIC_API_KEY not configured")

                client = AzureAnthropicClient()
                model_kwargs = {
                    "model": model,
                    "stream": True,
                    "max_tokens": model_config.get("max_tokens", 16384),
                }
                if "temperature" in model_config:
                    model_kwargs["temperature"] = model_config["temperature"]
                if "top_p" in model_config:
                    model_kwargs["top_p"] = model_config["top_p"]

                api_kwargs = client.convert_inputs_to_api_kwargs(
                    input=prompt,
                    model_kwargs=model_kwargs,
                    model_type=ModelType.LLM
                )

                # Anthropic streaming uses async context manager
                async with await client.acall(api_kwargs=api_kwargs, model_type=ModelType.LLM) as stream:
                    async for text in stream.text_stream:
                        if text:
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

        # Validate and fix wiki_structure XML if present
        content = self._validate_and_fix_wiki_structure_xml(content)

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
