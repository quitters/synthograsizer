"""SQLite state for a film project. One db per project dir, WAL mode,
single shared connection guarded by an RLock (async tasks + worker threads)."""
import json
import sqlite3
import threading
from pathlib import Path

SCHEMA = """
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);

CREATE TABLE IF NOT EXISTS assets (
  id TEXT PRIMARY KEY,            -- e.g. char_kaira, loc_arena, style_1
  kind TEXT,                      -- character | location | style
  name TEXT,
  prompt TEXT,
  path TEXT,
  status TEXT DEFAULT 'pending',  -- pending | done | failed
  cost REAL DEFAULT 0,
  error TEXT
);

CREATE TABLE IF NOT EXISTS shots (
  id TEXT PRIMARY KEY,            -- A1_S03_02
  seq INTEGER,
  act TEXT, scene TEXT, title TEXT,
  duration INTEGER DEFAULT 8,
  veo_prompt TEXT,
  keyframe_prompt TEXT,
  characters TEXT DEFAULT '[]',   -- json list of character asset ids
  location TEXT,
  needs_keyframe INTEGER DEFAULT 1,
  keyframe_path TEXT,
  keyframe_status TEXT DEFAULT 'pending',  -- pending | done | failed | skipped
  keyframe_cost REAL DEFAULT 0,
  status TEXT DEFAULT 'pending',  -- pending | rendering | selected | failed
  selected_take TEXT,
  excluded INTEGER DEFAULT 0,     -- excluded from assembly
  error TEXT
);

CREATE TABLE IF NOT EXISTS takes (
  id TEXT PRIMARY KEY,            -- <shot_id>_t1
  shot_id TEXT,
  n INTEGER,
  path TEXT,
  video_uri TEXT,
  cost REAL DEFAULT 0,
  status TEXT,                    -- done | failed | filtered
  qc_score REAL,
  qc_notes TEXT,
  error TEXT
);

CREATE TABLE IF NOT EXISTS ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT, stage TEXT, item TEXT, model TEXT,
  units REAL, unit_kind TEXT, usd REAL
);
"""


class DB:
    def __init__(self, project_dir: Path):
        self.project_dir = Path(project_dir)
        self.project_dir.mkdir(parents=True, exist_ok=True)
        self.path = self.project_dir / "film.db"
        self.lock = threading.RLock()
        self.conn = sqlite3.connect(str(self.path), check_same_thread=False)
        self.conn.execute("PRAGMA journal_mode=WAL")
        with self.lock:
            self.conn.executescript(SCHEMA)
            self.conn.commit()
        self._migrate()

    # additive, dict-driven migrations so pre-existing project dbs keep working
    _MIGRATIONS = {"shots": {"excluded": "INTEGER DEFAULT 0"}}

    def _migrate(self):
        with self.lock:
            for table, cols in self._MIGRATIONS.items():
                have = {r[1] for r in self.conn.execute(f"PRAGMA table_info({table})")}
                for col, decl in cols.items():
                    if col not in have:
                        self.conn.execute(f"ALTER TABLE {table} ADD COLUMN {col} {decl}")
            self.conn.commit()

    def exec(self, sql, params=()):
        with self.lock:
            cur = self.conn.execute(sql, params)
            self.conn.commit()
            return cur

    def fetchone(self, sql, params=()):
        with self.lock:
            return self.conn.execute(sql, params).fetchone()

    def fetchall(self, sql, params=()):
        with self.lock:
            return self.conn.execute(sql, params).fetchall()

    def get_meta(self, key, default=None):
        row = self.fetchone("SELECT value FROM meta WHERE key=?", (key,))
        return row[0] if row else default

    def set_meta(self, key, value):
        self.exec("INSERT INTO meta (key,value) VALUES (?,?) "
                  "ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                  (key, str(value)))

    # -- convenience -------------------------------------------------------
    def film(self) -> dict:
        p = self.project_dir / "film.json"
        return json.loads(p.read_text(encoding="utf-8")) if p.exists() else {}

    def save_film(self, film: dict):
        (self.project_dir / "film.json").write_text(
            json.dumps(film, indent=2, ensure_ascii=False), encoding="utf-8")

    def dirs(self):
        d = {k: self.project_dir / k for k in
             ("bible", "keyframes", "takes", "exports", "qc_frames", "_raw")}
        for p in d.values():
            p.mkdir(exist_ok=True)
        return d
