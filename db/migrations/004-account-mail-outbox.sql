CREATE TABLE IF NOT EXISTS account_mail_outbox (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  purpose text NOT NULL CHECK (purpose IN ('reset', 'verify')),
  encrypted_payload text NOT NULL,
  expires_at timestamptz NOT NULL,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  attempts integer NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS account_mail_due ON account_mail_outbox (next_attempt_at);
