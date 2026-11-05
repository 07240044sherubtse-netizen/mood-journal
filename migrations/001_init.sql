-- migrations/001_init.sql
-- Same DDL as schema.sql, kept here so a migration runner can be added later.
-- psql -U postgres -d mood_journal -f migrations/001_init.sql

CREATE TABLE IF NOT EXISTS users (
  id                  SERIAL PRIMARY KEY,
  name                VARCHAR(100) NOT NULL,
  email               VARCHAR(255) NOT NULL UNIQUE,
  password_hash       VARCHAR(255) NOT NULL,
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

ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_token_expires TIMESTAMPTZ;

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

CREATE INDEX IF NOT EXISTS idx_entries_user_date ON entries (user_id, entry_date);

CREATE TABLE IF NOT EXISTS admin_actions (
  id             SERIAL PRIMARY KEY,
  admin_id       INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action         VARCHAR(50) NOT NULL,
  target_user_id INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_actions_created ON admin_actions (created_at DESC);
