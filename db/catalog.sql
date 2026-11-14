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
