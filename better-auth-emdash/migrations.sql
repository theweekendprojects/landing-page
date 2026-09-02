-- Better-Auth migrations for EmDash
-- Adds tables needed by Better-Auth while using EmDash's existing users and oauth_accounts tables

-- ============================================================================
-- auth_sessions: Stores Better-Auth sessions (separate from EmDash's cookie session)
-- ============================================================================

CREATE TABLE IF NOT EXISTS auth_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  ip_address TEXT,
  user_agent TEXT
);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_user ON auth_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires ON auth_sessions(expires_at);

-- ============================================================================
-- auth_verifications: Stores verification tokens (email verification, magic links)
-- ============================================================================

CREATE TABLE IF NOT EXISTS auth_verifications (
  id TEXT PRIMARY KEY,
  identifier TEXT NOT NULL,
  value TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_auth_verifications_identifier ON auth_verifications(identifier);
CREATE INDEX IF NOT EXISTS idx_auth_verifications_expires ON auth_verifications(expires_at);

-- ============================================================================
-- Add password column to oauth_accounts for email/password auth storage
-- ============================================================================

ALTER TABLE oauth_accounts ADD COLUMN password TEXT;

-- ============================================================================
-- Indexes for Better-Auth lookups
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_oauth_accounts_user ON oauth_accounts(user_id);
