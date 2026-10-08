/**
 * The roster's tables, as numbered migrations (see sqlite.js). Add a new one at the end; never edit one that has shipped.
 *
 *   candidates       the library: one row per invented person (archetype, type, background, skills), the Agent Profile that is their sheet, the
 *                    casting row (the facts code drew), what the checks said, and the quiz. A candidate has no memory of work.
 *   employees        a candidate hired into ONE company's department. The seat holds the job (position, who they report to, run settings)
 *                    and, through memory_entries, what this person has learned in this company and nowhere else. The same candidate hired
 *                    by two companies is two employees with two separate memories: no memory crosses a company.
 *   memory_entries   what an employee remembers: summaries of sessions, lessons, relationships, notes. The owner can read, edit and delete each.
 *   archetype_lessons what has been learned about casting an archetype (a check that fired on someone cast from it, or the owner's note), shown to
 *                    the writer next time. This is how an archetype "evolves with use".
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
  department_id  TEXT NOT NULL,
  candidate_id   TEXT NOT NULL REFERENCES candidates (id) ON DELETE RESTRICT,
  position       TEXT NOT NULL,
  reports_to     TEXT,
  is_lead        INTEGER NOT NULL DEFAULT 0,
  reviewer_of    TEXT,
  tier           TEXT NOT NULL,
  model          TEXT,
  thinking       TEXT,
  knobs          TEXT NOT NULL DEFAULT '{}',
  sessions       INTEGER NOT NULL DEFAULT 0,
  hired_at       TEXT NOT NULL,
  left_at        TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS employees_one_seat ON employees (company_id, candidate_id) WHERE left_at IS NULL;
CREATE INDEX IF NOT EXISTS employees_by_company ON employees (company_id, department_id);
CREATE INDEX IF NOT EXISTS employees_by_candidate ON employees (candidate_id);

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
];
