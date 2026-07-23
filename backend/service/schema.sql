-- Synthograsizer service schema (Postgres). Applied idempotently at startup
-- by backend/service/db.py; additive changes go through _MIGRATIONS there.

CREATE TABLE IF NOT EXISTS schema_version (
  version INT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id                     BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  google_sub             TEXT NOT NULL UNIQUE,   -- stable Google subject; email can change
  email                  TEXT NOT NULL UNIQUE,   -- stored lowercased
  email_verified         BOOLEAN NOT NULL DEFAULT FALSE,
  name                   TEXT,
  avatar_url             TEXT,
  tier                   TEXT NOT NULL DEFAULT 'free',  -- 'free' | 'plus' (future); admin is env-derived, never stored
  credits_balance        INT  NOT NULL DEFAULT 0 CHECK (credits_balance >= 0),
  credits_period         TEXT,                          -- 'YYYY-MM' of the last monthly grant (UTC)
  accepted_terms_version TEXT,
  age_attested_at        TIMESTAMPTZ,
  stripe_customer_id     TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at          TIMESTAMPTZ,
  disabled_at            TIMESTAMPTZ                    -- ban switch
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash   TEXT PRIMARY KEY,                        -- sha256 hex of the opaque cookie token
  user_id      BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at   TIMESTAMPTZ NOT NULL,
  last_seen_at TIMESTAMPTZ,
  user_agent   TEXT,
  ip_hash      TEXT                                     -- sha256(day|ip); never the raw IP
);
CREATE INDEX IF NOT EXISTS sessions_user_idx    ON sessions(user_id);
CREATE INDEX IF NOT EXISTS sessions_expires_idx ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS credit_ledger (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id       BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ts            TIMESTAMPTZ NOT NULL DEFAULT now(),
  delta         INT NOT NULL,                           -- +grant / -charge / +refund
  reason        TEXT NOT NULL,                          -- 'monthly_grant'|'charge'|'refund'|'adjustment'|'purchase'
  balance_after INT NOT NULL,
  generation_id BIGINT,                                 -- soft link to generations.id
  note          TEXT
);
CREATE INDEX IF NOT EXISTS credit_ledger_user_ts ON credit_ledger(user_id, ts);

CREATE TABLE IF NOT EXISTS generations (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id      BIGINT REFERENCES users(id) ON DELETE SET NULL,  -- DSAR delete anonymizes, keeps spend history
  ts           TIMESTAMPTZ NOT NULL DEFAULT now(),
  endpoint     TEXT NOT NULL,
  action       TEXT NOT NULL,        -- 'text'|'chat'|'image'|'template'|'analyze'|'video'|'music'
  model        TEXT,
  units        REAL NOT NULL DEFAULT 1,
  unit_kind    TEXT,                 -- 'call'|'image'|'sec'
  credits      INT NOT NULL DEFAULT 0,
  usd_est      NUMERIC(8,4) NOT NULL DEFAULT 0,
  status       TEXT NOT NULL,        -- 'ok'|'failed'|'refunded'
  latency_ms   INT,
  prompt_chars INT,                  -- length only; prompt bodies are never stored
  tokens_in    INT,
  tokens_out   INT,
  error        TEXT                  -- short classification, not raw messages
);
CREATE INDEX IF NOT EXISTS generations_ts      ON generations(ts);
CREATE INDEX IF NOT EXISTS generations_user_ts ON generations(user_id, ts);

CREATE TABLE IF NOT EXISTS feedback (
  id      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  ts      TIMESTAMPTZ NOT NULL DEFAULT now(),
  payload JSONB NOT NULL
);

-- Saved creations ("My creations" gallery). Deliberately NOT columns on
-- generations: those rows are inserted at reserve time before any output
-- exists, age out with RETENTION_DAYS, and survive a DSAR delete anonymized.
-- Artifacts need the opposite lifecycle — they are the user's library, kept
-- until they delete it, and hard-CASCADEd with the account.
--
-- CASCADE removes ROWS, not GCS objects: backend/routers/account.py purges the
-- users/{id}/ prefix before deleting the user, and the retention janitor sweeps
-- any prefix left orphaned by a partial failure.
CREATE TABLE IF NOT EXISTS artifacts (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id       BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  generation_id BIGINT,                        -- soft link, like credit_ledger
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  kind          TEXT NOT NULL,                 -- 'image'|'video'|'music'|'template'
  mime          TEXT NOT NULL,
  bytes         BIGINT NOT NULL CHECK (bytes >= 0),
  storage_path  TEXT NOT NULL UNIQUE,          -- users/{user_id}/{id}.{ext}
  label         TEXT,                          -- optional user-facing name
  thumb_path    TEXT                           -- users/{user_id}/{id}_thumb.jpg, NULL if none (v3)
);
-- Covers both the gallery listing and the SUM(bytes) quota check.
CREATE INDEX IF NOT EXISTS artifacts_user_created ON artifacts(user_id, created_at DESC);
