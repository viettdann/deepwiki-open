import asyncio
import logging
import os
from typing import Dict, Set, Optional
from datetime import datetime, timedelta

from api.data_pipeline import update_repo, detect_repo_changes, mark_repo_processed

logger = logging.getLogger(__name__)

class WikiUpdateScheduler:
    def __init__(self):
        self.update_intervals: Dict[str, int] = {}
        self.repo_info: Dict[str, Dict] = {}
        self.active_repos: Set[str] = set()
        self.running = False
        self.max_concurrent_updates = 5
        self.current_updates = 0
        self.update_history: Dict[str, list[Dict]] = {}

    def schedule_repo_update(self, repo_id: str, repo_url: str, local_path: str,
                             access_token: str = None, repo_type: str = None,
                             interval_hours: int = 24, enabled: bool = True,
                             require_changes: bool = True):
        if not enabled:
            self.unschedule_repo_update(repo_id)
            return

        self.update_intervals[repo_id] = interval_hours
        self.repo_info[repo_id] = {
            "repo_url": repo_url,
            "local_path": local_path,
            "access_token": access_token,
            "repo_type": repo_type,
            "last_update": None,
            "last_error": None,
            "update_count": 0,
            "require_changes": require_changes,
        }
        self.active_repos.add(repo_id)
        logger.info(f"Scheduled auto-update for {repo_id} every {interval_hours} hours")

    def unschedule_repo_update(self, repo_id: str):
        self.active_repos.discard(repo_id)
        self.update_intervals.pop(repo_id, None)
        self.repo_info.pop(repo_id, None)
        logger.info(f"Removed auto-update schedule for {repo_id}")

    async def start_scheduler(self):
        self.running = True
        logger.info("Starting wiki update scheduler")
        while self.running:
            try:
                await self._run_due_updates()
                await asyncio.sleep(60)
            except Exception as e:
                logger.error(f"Scheduler error: {e}")
                await asyncio.sleep(60)

    def stop_scheduler(self):
        self.running = False
        logger.info("Stopped wiki update scheduler")

    async def _run_due_updates(self):
        now = datetime.now()
        for repo_id in list(self.active_repos):
            info = self.repo_info.get(repo_id)
            if not info:
                continue
            last = info["last_update"]
            interval = self.update_intervals.get(repo_id, 24)
            if last is None or (now - last).total_seconds() >= interval * 3600:
                if self.current_updates >= self.max_concurrent_updates:
                    logger.warning(f"Max concurrent updates reached, skipping {repo_id}")
                    continue
                self.current_updates += 1
                try:
                    await asyncio.to_thread(self._perform_repo_update, repo_id)
                finally:
                    self.current_updates -= 1

    def _perform_repo_update(self, repo_id: str):
        if repo_id not in self.repo_info:
            logger.warning(f"Repo {repo_id} not found in scheduler info")
            return
        info = self.repo_info[repo_id]
        path = info["local_path"]
        access_token = info["access_token"]
        repo_type = info["repo_type"]
        owner, repo = self._parse_owner_repo(repo_id)
        try:
            result = update_repo(path, access_token, repo_type)
            logger.info(f"Auto-update {repo_id}: {result}")
            has_changes, current_hash = detect_repo_changes(path)
            should_process = has_changes or (not info.get("require_changes", True))
            if should_process and isinstance(current_hash, str):
                logger.info(f"Processing repo {repo_id}")
                mark_repo_processed(path, current_hash)
                self._invalidate_wiki_cache(repo_type, owner, repo)
                info["update_count"] += 1
                info["last_update"] = datetime.now()
                info["last_error"] = None
                self._record_history(repo_id, {
                    "timestamp": datetime.now().isoformat(),
                    "status": "success",
                    "message": result,
                    "update_count": info["update_count"],
                })
            else:
                info["last_update"] = datetime.now()
                self._record_history(repo_id, {
                    "timestamp": datetime.now().isoformat(),
                    "status": "skipped",
                    "message": "No changes detected",
                    "update_count": info["update_count"],
                })
        except Exception as e:
            logger.error(f"Failed to auto-update {repo_id}: {e}")
            info["last_error"] = str(e)
            self._record_history(repo_id, {
                "timestamp": datetime.now().isoformat(),
                "status": "error",
                "message": str(e),
                "update_count": info.get("update_count", 0),
            })

    def get_repo_status(self, repo_id: str) -> Optional[Dict]:
        return self.repo_info.get(repo_id)

    def get_all_repos_status(self) -> Dict[str, Dict]:
        return self.repo_info.copy()

    def cleanup_old_repos(self, days: int = 30):
        cutoff = datetime.now() - timedelta(days=days)
        to_remove = []
        for repo_id, info in self.repo_info.items():
            if info["last_update"] and info["last_update"] < cutoff:
                to_remove.append(repo_id)
        for rid in to_remove:
            self.unschedule_repo_update(rid)
            logger.info(f"Cleaned up old repo schedule: {rid}")

    def _record_history(self, repo_id: str, entry: Dict):
        history = self.update_history.setdefault(repo_id, [])
        history.insert(0, entry)
        if len(history) > 100:
            del history[100:]

    def get_update_history(self, repo_id: str, limit: int = 10) -> list[Dict]:
        return (self.update_history.get(repo_id, [])[:limit])

    def _parse_owner_repo(self, repo_id: str) -> tuple[str, str]:
        try:
            parts = repo_id.split("/")
            if len(parts) >= 3:
                return parts[1], parts[2]
        except Exception:
            pass
        return "", ""

    def _get_cache_dir(self) -> str:
        return os.path.join(os.path.expanduser(os.path.join("~", ".adalflow")), "wikicache")

    def _invalidate_wiki_cache(self, repo_type: Optional[str], owner: str, repo: str):
        try:
            cache_dir = self._get_cache_dir()
            if not os.path.isdir(cache_dir):
                return
            prefix = f"deepwiki_cache_{repo_type}_{owner}_{repo}_"
            for name in os.listdir(cache_dir):
                if name.startswith(prefix) and name.endswith(".json"):
                    try:
                        os.remove(os.path.join(cache_dir, name))
                    except Exception:
                        continue
        except Exception:
            pass

scheduler = WikiUpdateScheduler()
