-- Add password column to oauth_accounts for email/password auth
ALTER TABLE oauth_accounts ADD COLUMN password TEXT;

CREATE INDEX IF NOT EXISTS idx_oauth_accounts_user ON oauth_accounts(user_id);
