CREATE TABLE IF NOT EXISTS catalog_title (
  source text NOT NULL,
  upstream_id text NOT NULL,
  locale text NOT NULL,
  name text NOT NULL,
  synopsis text NOT NULL,
  PRIMARY KEY (source, upstream_id, locale)
);

CREATE TABLE IF NOT EXISTS catalog_episode (
  source text NOT NULL,
  title_id text NOT NULL,
  locale text NOT NULL,
  upstream_id text NOT NULL,
  episode_number integer NOT NULL CHECK (episode_number > 0),
  name text NOT NULL,
  PRIMARY KEY (source, title_id, locale, upstream_id),
  FOREIGN KEY (source, title_id, locale)
    REFERENCES catalog_title (source, upstream_id, locale)
);

CREATE TABLE IF NOT EXISTS catalog_checkpoint (
  source text PRIMARY KEY,
  cursor text,
  revision bigint NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS catalog_sync_run (
  id uuid PRIMARY KEY,
  source text NOT NULL,
  status text NOT NULL CHECK (status IN ('running', 'succeeded', 'failed')),
  pages integer NOT NULL DEFAULT 0,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);

ALTER TABLE catalog_checkpoint ADD COLUMN IF NOT EXISTS watermark text;

CREATE INDEX IF NOT EXISTS catalog_sync_run_source_started
  ON catalog_sync_run (source, started_at DESC);

CREATE OR REPLACE VIEW catalog_source_health AS
SELECT latest.source, latest.status, latest.pages, latest.started_at,
       latest.finished_at, success.last_success_at, checkpoint.cursor AS resume_cursor
FROM (
  SELECT DISTINCT ON (source) source, status, pages, started_at, finished_at
  FROM catalog_sync_run
  ORDER BY source, started_at DESC, id DESC
) latest
LEFT JOIN (
  SELECT source, max(finished_at) AS last_success_at
  FROM catalog_sync_run WHERE status = 'succeeded' GROUP BY source
) success USING (source)
LEFT JOIN catalog_checkpoint checkpoint USING (source);

CREATE TABLE IF NOT EXISTS fixture_media_asset (
  source text NOT NULL,
  title_id text NOT NULL,
  locale text NOT NULL,
  episode_id text NOT NULL,
  checksum text NOT NULL CHECK (checksum ~ '^[a-f0-9]{64}$'),
  PRIMARY KEY (source, title_id, locale, episode_id, checksum),
  CHECK (source = 'fixture'),
  FOREIGN KEY (source, title_id, locale, episode_id)
    REFERENCES catalog_episode (source, title_id, locale, upstream_id)
);

ALTER TABLE fixture_media_asset ADD COLUMN IF NOT EXISTS storage_bucket text;
ALTER TABLE fixture_media_asset ADD COLUMN IF NOT EXISTS storage_prefix text;
ALTER TABLE fixture_media_asset ADD COLUMN IF NOT EXISTS available_at timestamptz;

CREATE TABLE IF NOT EXISTS media_settings (
  id integer PRIMARY KEY CHECK (id = 1),
  cdn_base_url text
);

CREATE TABLE IF NOT EXISTS app_user (
  id uuid PRIMARY KEY,
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  disabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS app_session (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS app_session_expiry ON app_session(expires_at);

CREATE TABLE IF NOT EXISTS oauth_provider_settings (
  provider text PRIMARY KEY CHECK (provider IN ('google', 'apple')),
  enabled boolean NOT NULL DEFAULT false,
  client_id text,
  team_id text,
  key_id text
);
