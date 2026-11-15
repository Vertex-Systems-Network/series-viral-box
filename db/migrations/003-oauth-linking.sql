ALTER TABLE oauth_attempt ADD COLUMN IF NOT EXISTS link_session_hash text
  REFERENCES app_session(token_hash) ON DELETE CASCADE;
