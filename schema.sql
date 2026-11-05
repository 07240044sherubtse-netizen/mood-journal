-- MoodJournal database schema
-- Run it once on a fresh database:
--   createdb mood_journal
--   psql -U postgres -d mood_journal -f schema.sql
-- Safe to run again: every statement is CREATE ... IF NOT EXISTS.

-- Users ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id                  SERIAL PRIMARY KEY,
  name                VARCHAR(100) NOT NULL,
  email               VARCHAR(255) NOT NULL UNIQUE,      -- always stored lowercase
  password_hash       VARCHAR(255) NOT NULL,             -- bcrypt hash, never the password
  role                VARCHAR(20)  NOT NULL DEFAULT 'user'
                      CHECK (role IN ('user', 'superadmin')),
  is_verified         BOOLEAN      NOT NULL DEFAULT false,
  is_active           BOOLEAN      NOT NULL DEFAULT true,
  verification_token  VARCHAR(255),
  verification_token_expires TIMESTAMPTZ,
  reset_token         VARCHAR(255),
  reset_token_expires TIMESTAMPTZ,
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Upgrade databases created before verification expiry was added.
ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_token_expires TIMESTAMPTZ;

-- Entries -------------------------------------------------------------------
-- One row per user per day: the UNIQUE (user_id, entry_date) constraint is what
-- makes "only ONE mood entry per user per day" impossible to break.
CREATE TABLE IF NOT EXISTS entries (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entry_date DATE         NOT NULL,
  mood       VARCHAR(20)  NOT NULL
             CHECK (mood IN ('happy','calm','excited','neutral','tired','anxious','sad','angry')),
  note       VARCHAR(200),
  created_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
  UNIQUE (user_id, entry_date)
);

-- Fast look-ups for a single user's calendar / streak queries.
CREATE INDEX IF NOT EXISTS idx_entries_user_date ON entries (user_id, entry_date);

-- Admin action log ----------------------------------------------------------
-- Every change a super admin makes is recorded here.
CREATE TABLE IF NOT EXISTS admin_actions (
  id             SERIAL PRIMARY KEY,
  admin_id       INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action         VARCHAR(50) NOT NULL,
  target_user_id INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_actions_created ON admin_actions (created_at DESC);

