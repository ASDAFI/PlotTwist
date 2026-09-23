from contextlib import contextmanager
from pathlib import Path
import sqlite3

SCHEMA = '''
CREATE TABLE IF NOT EXISTS workspaces (
 id TEXT PRIMARY KEY, dataset_rel TEXT NOT NULL UNIQUE, responses_rel TEXT,
 mapping_json TEXT NOT NULL DEFAULT '{}', active_import_id TEXT, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS items (
 id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id),
 relative_key TEXT NOT NULL, original_bytes BLOB NOT NULL, source_hash TEXT NOT NULL,
 image_hash TEXT NOT NULL, data_json TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1,
 modified INTEGER NOT NULL DEFAULT 0, deleted INTEGER NOT NULL DEFAULT 0,
 editor_json TEXT, updated_at TEXT NOT NULL,
 UNIQUE(workspace_id, relative_key)
);
CREATE TABLE IF NOT EXISTS history (
 id INTEGER PRIMARY KEY, item_id TEXT NOT NULL REFERENCES items(id),
 previous_data TEXT NOT NULL, previous_deleted INTEGER NOT NULL,
 actor_json TEXT NOT NULL, version INTEGER NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS jobs (
 id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), kind TEXT NOT NULL,
 status TEXT NOT NULL, progress INTEGER NOT NULL DEFAULT 0, total INTEGER NOT NULL DEFAULT 0,
 cancel_requested INTEGER NOT NULL DEFAULT 0, request_json TEXT NOT NULL,
 result_json TEXT, error TEXT, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS response_rows (
 id INTEGER PRIMARY KEY, import_id TEXT NOT NULL REFERENCES jobs(id), item_id TEXT REFERENCES items(id),
 filename TEXT NOT NULL, line_number INTEGER NOT NULL, model TEXT NOT NULL,
 match_status TEXT NOT NULL, parse_status TEXT NOT NULL,
 visible_output TEXT, answer TEXT, reasoning TEXT, raw_json TEXT, error TEXT
);
CREATE INDEX IF NOT EXISTS idx_items_workspace ON items(workspace_id);
CREATE INDEX IF NOT EXISTS idx_history_item ON history(item_id, version);
CREATE INDEX IF NOT EXISTS idx_response_import_item ON response_rows(import_id, item_id);
CREATE INDEX IF NOT EXISTS idx_jobs_workspace ON jobs(workspace_id, created_at);
PRAGMA user_version = 1;
'''

class Store:
    def __init__(self, root: Path):
        self.path = root / 'workspace.sqlite'
        with self.connection() as db:
            version = db.execute('PRAGMA user_version').fetchone()[0]
            if version > 1:
                raise RuntimeError('State was created by a newer PlotTwist version.')
            db.executescript(SCHEMA)
            db.execute('PRAGMA optimize')

    @contextmanager
    def connection(self, *, immediate=False):
        db = sqlite3.connect(self.path, timeout=20)
        db.row_factory = sqlite3.Row
        db.execute('PRAGMA foreign_keys=ON')
        db.execute('PRAGMA journal_mode=WAL')
        db.execute('PRAGMA synchronous=FULL')
        try:
            if immediate:
                db.execute('BEGIN IMMEDIATE')
            yield db
            db.commit()
        except BaseException:
            db.rollback()
            raise
        finally:
            db.close()
