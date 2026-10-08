/**
 * The roster's tables, as numbered migrations (see sqlite.js). Add a new one at the end; never edit one that has shipped.
 *
 *   candidates       the library: one row per invented person (archetype, type, background, skills), the Agent Profile that is their sheet, the
 *                    casting row (the facts code drew), what the checks said, and the quiz. A candidate has no memory of work.
 *   employees        a candidate hired into ONE company: the person at work there, with a standing title, a mailbox (hall tables, migration 2) and,
 *                    through memory_entries, what they have learned in this company and nowhere else. The same candidate hired by two companies is
 *                    two employees with two separate memories: no memory crosses a company.
 *   assignments      an employee's seat in a room: the department, the position there, who they report to, whether they lead it or review its
 *                    files, and the run settings for that job. A person has a home department and can take another seat for a task team; it is
 *                    still one person with one mailbox and one memory.
 *   memory_entries   what an employee remembers: summaries of sessions, lessons, relationships, notes. The owner can read, edit and delete each.
 *   archetype_lessons what has been learned about casting an archetype (a check that fired on someone cast from it, or the owner's note), shown to
 *                    the writer next time. This is how an archetype "evolves with use".
 *
 *
 * Migration 2 is the Hall, the collaboration layer between rooms (company/hall/): mail (a mailbox per employee), forums (persistent
 * threads everyone in a company can read), the workspace (shared, versioned files), the board (tasks with a lead and members) and norms
 * (working agreements proposed by the people and decided by the owner). All of it is keyed by company, and the mail table is tied to the
 * employee it was sent to, so removing a person removes their mailbox.
 *
 * Every table carries owner_id (the visitor cookie id) and every query filters by it: one owner's roster is invisible to another.
 */
export const MIGRATIONS = [
  {
    version: 1,
    name: 'roster',
    sql: `
CREATE TABLE IF NOT EXISTS candidates (
  id             TEXT PRIMARY KEY,
  owner_id       TEXT NOT NULL,
  name           TEXT NOT NULL,
  archetype      TEXT NOT NULL,
  role           TEXT NOT NULL,
  intended_type  TEXT,
  measured_type  TEXT,
  born_year      INTEGER,
  birth_city     TEXT,
  birth_country  TEXT,
  region         TEXT,
  culture        TEXT,
  pronoun        TEXT,
  tier           TEXT NOT NULL DEFAULT 'none',
  model          TEXT,
  thinking       TEXT,
  dissent        TEXT NOT NULL DEFAULT 'low',
  temperament    TEXT,
  working_style  TEXT,
  skills         TEXT NOT NULL DEFAULT '[]',
  status         TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'ready', 'retired')),
  profile        TEXT NOT NULL,
  casting        TEXT NOT NULL DEFAULT '{}',
  checks         TEXT,
  quiz           TEXT,
  written_by     TEXT,
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS candidates_by_owner ON candidates (owner_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS candidates_name_per_owner ON candidates (owner_id, name COLLATE NOCASE);

CREATE TABLE IF NOT EXISTS employees (
  id             TEXT PRIMARY KEY,
  owner_id       TEXT NOT NULL,
  company_id     TEXT NOT NULL,
  candidate_id   TEXT NOT NULL REFERENCES candidates (id) ON DELETE RESTRICT,
  title          TEXT NOT NULL,
  knobs          TEXT NOT NULL DEFAULT '{}',
  sessions       INTEGER NOT NULL DEFAULT 0,
  hired_at       TEXT NOT NULL,
  left_at        TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS employees_one_per_company ON employees (company_id, candidate_id) WHERE left_at IS NULL;
CREATE INDEX IF NOT EXISTS employees_by_company ON employees (owner_id, company_id);
CREATE INDEX IF NOT EXISTS employees_by_candidate ON employees (candidate_id);

CREATE TABLE IF NOT EXISTS assignments (
  id             TEXT PRIMARY KEY,
  owner_id       TEXT NOT NULL,
  company_id     TEXT NOT NULL,
  employee_id    TEXT NOT NULL REFERENCES employees (id) ON DELETE CASCADE,
  department_id  TEXT NOT NULL,
  position       TEXT NOT NULL,
  reports_to     TEXT,
  is_lead        INTEGER NOT NULL DEFAULT 0,
  reviewer_of    TEXT,
  tier           TEXT NOT NULL,
  model          TEXT,
  thinking       TEXT,
  task_id        TEXT,
  created_at     TEXT NOT NULL,
  ended_at       TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS assignments_one_seat ON assignments (employee_id, department_id) WHERE ended_at IS NULL;
CREATE INDEX IF NOT EXISTS assignments_by_department ON assignments (owner_id, company_id, department_id);

CREATE TABLE IF NOT EXISTS memory_entries (
  id           TEXT PRIMARY KEY,
  employee_id  TEXT NOT NULL REFERENCES employees (id) ON DELETE CASCADE,
  company_id   TEXT NOT NULL,
  session      TEXT,
  kind         TEXT NOT NULL CHECK (kind IN ('summary', 'lesson', 'relationship', 'note')),
  text         TEXT NOT NULL,
  source       TEXT NOT NULL CHECK (source IN ('agent', 'owner')),
  verified     TEXT NOT NULL DEFAULT 'unchecked' CHECK (verified IN ('unchecked', 'confirmed', 'contradicted')),
  note         TEXT,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS memory_by_employee ON memory_entries (employee_id, created_at);

CREATE TABLE IF NOT EXISTS archetype_lessons (
  id          TEXT PRIMARY KEY,
  owner_id    TEXT NOT NULL,
  archetype   TEXT NOT NULL,
  text        TEXT NOT NULL,
  source      TEXT NOT NULL,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS lessons_by_archetype ON archetype_lessons (owner_id, archetype, created_at);
`,
  },
  {
    version: 2,
    name: 'hall',
    sql: `
CREATE TABLE IF NOT EXISTS mail (
  id          TEXT PRIMARY KEY,
  owner_id    TEXT NOT NULL,
  company_id  TEXT NOT NULL,
  thread_id   TEXT NOT NULL,
  reply_to    TEXT,
  from_id     TEXT,
  from_name   TEXT NOT NULL,
  to_id       TEXT NOT NULL REFERENCES employees (id) ON DELETE CASCADE,
  kind        TEXT NOT NULL CHECK (kind IN ('ask', 'answer', 'handoff', 'review', 'decision', 'fyi', 'notice')),
  subject     TEXT NOT NULL,
  body        TEXT NOT NULL,
  ref         TEXT,
  state       TEXT NOT NULL DEFAULT 'unread' CHECK (state IN ('unread', 'read', 'done')),
  created_at  TEXT NOT NULL,
  read_at     TEXT,
  done_at     TEXT
);
CREATE INDEX IF NOT EXISTS mail_inbox ON mail (to_id, state);
CREATE INDEX IF NOT EXISTS mail_thread ON mail (company_id, thread_id);

CREATE TABLE IF NOT EXISTS forum_channels (
  id             TEXT PRIMARY KEY,
  owner_id       TEXT NOT NULL,
  company_id     TEXT NOT NULL,
  slug           TEXT NOT NULL,
  title          TEXT NOT NULL,
  purpose        TEXT NOT NULL DEFAULT '',
  kind           TEXT NOT NULL DEFAULT 'custom',
  department_id  TEXT,
  post_policy    TEXT NOT NULL DEFAULT 'everyone' CHECK (post_policy IN ('everyone', 'leads', 'owner')),
  created_at     TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS forum_channel_slug ON forum_channels (company_id, slug);

CREATE TABLE IF NOT EXISTS forum_posts (
  id           TEXT PRIMARY KEY,
  owner_id     TEXT NOT NULL,
  company_id   TEXT NOT NULL,
  channel_id   TEXT NOT NULL REFERENCES forum_channels (id) ON DELETE CASCADE,
  thread_id    TEXT NOT NULL,
  reply_to     TEXT,
  author_id    TEXT,
  author_name  TEXT NOT NULL,
  title        TEXT,
  body         TEXT NOT NULL,
  pinned       INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS forum_by_channel ON forum_posts (channel_id, thread_id);

CREATE TABLE IF NOT EXISTS forum_reads (
  employee_id      TEXT NOT NULL REFERENCES employees (id) ON DELETE CASCADE,
  channel_id       TEXT NOT NULL REFERENCES forum_channels (id) ON DELETE CASCADE,
  last_seen_rowid  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (employee_id, channel_id)
);

CREATE TABLE IF NOT EXISTS workspace_files (
  id          TEXT PRIMARY KEY,
  owner_id    TEXT NOT NULL,
  company_id  TEXT NOT NULL,
  path        TEXT NOT NULL COLLATE NOCASE,
  content     TEXT NOT NULL,
  version     INTEGER NOT NULL,
  locked      INTEGER NOT NULL DEFAULT 0,
  written_by  TEXT NOT NULL,
  note        TEXT,
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS workspace_path ON workspace_files (company_id, path);

CREATE TABLE IF NOT EXISTS workspace_versions (
  file_id     TEXT NOT NULL REFERENCES workspace_files (id) ON DELETE CASCADE,
  version     INTEGER NOT NULL,
  content     TEXT NOT NULL,
  written_by  TEXT NOT NULL,
  note        TEXT,
  created_at  TEXT NOT NULL,
  PRIMARY KEY (file_id, version)
);

CREATE TABLE IF NOT EXISTS board_tasks (
  id                  TEXT PRIMARY KEY,
  owner_id            TEXT NOT NULL,
  company_id          TEXT NOT NULL,
  title               TEXT NOT NULL,
  description         TEXT NOT NULL DEFAULT '',
  status              TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'doing', 'review', 'done', 'blocked', 'cancelled')),
  lead_id             TEXT,
  members             TEXT NOT NULL DEFAULT '[]',
  department_id       TEXT,
  deliverable         TEXT,
  done_when           TEXT,
  needs_team          INTEGER NOT NULL DEFAULT 0,
  team_department_id  TEXT,
  created_by          TEXT NOT NULL,
  created_by_id       TEXT,
  log                 TEXT NOT NULL DEFAULT '[]',
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS board_by_company ON board_tasks (company_id, status);

CREATE TABLE IF NOT EXISTS norms (
  id              TEXT PRIMARY KEY,
  owner_id        TEXT NOT NULL,
  company_id      TEXT NOT NULL,
  text            TEXT NOT NULL,
  why             TEXT NOT NULL DEFAULT '',
  proposed_by     TEXT NOT NULL,
  proposed_by_id  TEXT,
  status          TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed', 'approved', 'rejected', 'withdrawn')),
  created_at      TEXT NOT NULL,
  decided_at      TEXT
);
CREATE INDEX IF NOT EXISTS norms_by_company ON norms (company_id, status);
`,
  },
];
