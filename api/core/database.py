"""
SQLite database manager with async support using aiosqlite.
Uses WAL mode for concurrent read/write access.
"""
import os
import logging
import asyncio
from pathlib import Path
from typing import Optional, List, Dict, Any
from contextlib import asynccontextmanager

import aiosqlite

from adalflow.utils import get_adalflow_default_root_path

logger = logging.getLogger(__name__)

# Database path
# Use a project-specific directory to avoid conflicts
DB_DIR = os.path.join(get_adalflow_default_root_path(), "deepwiki")
DB_PATH = os.path.join(DB_DIR, "deepwiki.db")


class DatabaseManager:
    """Singleton database manager for job persistence."""

    _instance: Optional['DatabaseManager'] = None
    _lock: asyncio.Lock = None

    def __init__(self):
        self.db_path = DB_PATH
        self._initialized = False

    @classmethod
    async def get_instance(cls) -> 'DatabaseManager':
        """Get or create singleton instance."""
        if cls._lock is None:
            cls._lock = asyncio.Lock()

        if cls._instance is None:
            async with cls._lock:
                if cls._instance is None:
                    cls._instance = DatabaseManager()
                    await cls._instance.initialize()
        return cls._instance

    async def initialize(self):
        """Initialize database and create tables."""
        if self._initialized:
            return

        # Ensure directory exists
        os.makedirs(os.path.dirname(self.db_path), exist_ok=True)

        # Read schema and create tables
        schema_path = Path(__file__).parent / "schema.sql"
        async with aiosqlite.connect(self.db_path) as db:
            # Enable WAL mode
            await db.execute("PRAGMA journal_mode=WAL")
            await db.execute("PRAGMA synchronous=NORMAL")
            await db.execute("PRAGMA foreign_keys=ON")

            # Load and execute schema
            if schema_path.exists():
                with open(schema_path, 'r') as f:
                    schema = f.read()
                # Split by semicolons and execute each statement
                for statement in schema.split(';'):
                    # Strip leading/trailing whitespace and comment lines
                    lines = statement.strip().splitlines()
                    # Remove leading comment-only lines
                    while lines and lines[0].strip().startswith('--'):
                        lines.pop(0)
                    statement = '\n'.join(lines).strip()
                    
                    # Skip empty statements and PRAGMA (already set above)
                    if statement and not statement.upper().startswith('PRAGMA'):
                        try:
                            # Log statement preview for debugging
                            preview = statement[:80].replace('\n', ' ')
                            logger.debug(f"Executing SQL: {preview}...")
                            await db.execute(statement)
                            logger.debug(f"SQL succeeded: {preview[:40]}")
                        except Exception as e:
                            # Ignore errors for CREATE IF NOT EXISTS
                            if "already exists" not in str(e).lower():
                                logger.warning(f"Schema statement failed: {e}\nStatement: {statement[:200]}")
            else:
                logger.error(f"Schema file not found at {schema_path}")

            await db.commit()

            # Verify tables exist
            cursor = await db.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name='jobs'"
            )
            result = await cursor.fetchone()
            if not result:
                raise RuntimeError(
                    f"Failed to create 'jobs' table. Schema path: {schema_path}, "
                    f"exists: {schema_path.exists()}, db_path: {self.db_path}"
                )

        self._initialized = True
        logger.info(f"Database initialized at {self.db_path}")

    @asynccontextmanager
    async def connection(self):
        """Get a database connection with WAL mode."""
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            await db.execute("PRAGMA foreign_keys=ON")
            yield db

    async def execute(self, query: str, params: tuple = ()) -> int:
        """Execute a query and return rowcount."""
        async with self.connection() as db:
            cursor = await db.execute(query, params)
            await db.commit()
            return cursor.rowcount

    async def execute_insert(self, query: str, params: tuple = ()) -> Optional[int]:
        """Execute an insert and return last row id."""
        async with self.connection() as db:
            cursor = await db.execute(query, params)
            await db.commit()
            return cursor.lastrowid

    async def fetch_one(self, query: str, params: tuple = ()) -> Optional[Dict[str, Any]]:
        """Fetch single row as dictionary."""
        async with self.connection() as db:
            cursor = await db.execute(query, params)
            row = await cursor.fetchone()
            if row:
                return dict(row)
            return None

    async def fetch_all(self, query: str, params: tuple = ()) -> List[Dict[str, Any]]:
        """Fetch all rows as list of dictionaries."""
        async with self.connection() as db:
            cursor = await db.execute(query, params)
            rows = await cursor.fetchall()
            return [dict(row) for row in rows]

    async def execute_many(self, query: str, params_list: List[tuple]) -> int:
        """Execute many inserts/updates."""
        async with self.connection() as db:
            await db.executemany(query, params_list)
            await db.commit()
            return len(params_list)

    async def execute_script(self, script: str):
        """Execute a SQL script with multiple statements."""
        async with self.connection() as db:
            await db.executescript(script)
            await db.commit()


# Convenience function for getting database instance
async def get_db() -> DatabaseManager:
    """Get database manager instance."""
    return await DatabaseManager.get_instance()
