CREATE TABLE IF NOT EXISTS password_reset (
  user_id uuid PRIMARY KEY REFERENCES app_user(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL
);

ALTER TABLE app_user ADD COLUMN IF NOT EXISTS email_verified_at timestamptz;
CREATE TABLE IF NOT EXISTS email_verification (
  user_id uuid PRIMARY KEY REFERENCES app_user(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL
);
