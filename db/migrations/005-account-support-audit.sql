CREATE TABLE IF NOT EXISTS account_support_event (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  viewer_id uuid NOT NULL,
  actor text NOT NULL,
  action text NOT NULL CHECK (action IN ('suspend', 'restore')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS account_support_event_viewer ON account_support_event (viewer_id, id DESC);
