CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS schema_migrations (
  name text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  filename text NOT NULL,
  mime_type text NOT NULL,
  file_data bytea NOT NULL,
  file_hash text NOT NULL,
  status text NOT NULL CHECK (status IN ('queued', 'processing', 'completed', 'failed')),
  decision text CHECK (decision IN ('Approved', 'Rejected', 'Needs Review')),
  explanation text,
  extracted_expense jsonb,
  rule_results jsonb NOT NULL DEFAULT '[]'::jsonb,
  policy_version text,
  error text,
  attempts integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS submissions_created_at_idx ON submissions (created_at DESC);
CREATE INDEX IF NOT EXISTS submissions_status_idx ON submissions (status);
CREATE INDEX IF NOT EXISTS submissions_file_hash_idx ON submissions (file_hash);
