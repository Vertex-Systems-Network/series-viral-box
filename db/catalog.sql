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
