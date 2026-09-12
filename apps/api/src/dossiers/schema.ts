export const storageSchema = `
CREATE SCHEMA IF NOT EXISTS h4j_api;
REVOKE ALL ON SCHEMA h4j_api FROM PUBLIC;
CREATE TABLE IF NOT EXISTS h4j_api.repository (
  id integer PRIMARY KEY CHECK (id = 1),
  snapshot jsonb NOT NULL CHECK (jsonb_typeof(snapshot) = 'object')
);
CREATE TABLE IF NOT EXISTS h4j_api.originals (
  id text PRIMARY KEY,
  storage_key uuid NOT NULL UNIQUE,
  metadata jsonb NOT NULL CHECK (jsonb_typeof(metadata) = 'object')
);
CREATE TABLE IF NOT EXISTS h4j_api.upload_receipts (
  scope text NOT NULL,
  key text NOT NULL,
  fingerprint text NOT NULL,
  response jsonb NOT NULL,
  PRIMARY KEY (scope, key)
);
CREATE TABLE IF NOT EXISTS h4j_api.lifecycle_commands (
  sequence bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  id text PRIMARY KEY,
  dossier_id text NOT NULL,
  payload jsonb NOT NULL,
  result jsonb NOT NULL,
  next_delivery_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS lifecycle_pending ON h4j_api.lifecycle_commands(next_delivery_at, sequence)
  WHERE result->>'status' = 'queued';
CREATE TABLE IF NOT EXISTS h4j_api.lifecycle_events (
  dossier_id text NOT NULL,
  version integer NOT NULL,
  event jsonb NOT NULL,
  PRIMARY KEY (dossier_id, version)
);
CREATE OR REPLACE FUNCTION h4j_api.reject_original_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Original documents are immutable'; END $$;
DROP TRIGGER IF EXISTS immutable_original ON h4j_api.originals;
CREATE TRIGGER immutable_original BEFORE UPDATE OR DELETE ON h4j_api.originals
FOR EACH ROW EXECUTE FUNCTION h4j_api.reject_original_mutation();
ALTER TABLE h4j_api.repository ENABLE ROW LEVEL SECURITY;
ALTER TABLE h4j_api.originals ENABLE ROW LEVEL SECURITY;
ALTER TABLE h4j_api.upload_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE h4j_api.lifecycle_commands ENABLE ROW LEVEL SECURITY;
ALTER TABLE h4j_api.lifecycle_events ENABLE ROW LEVEL SECURITY;
`;
