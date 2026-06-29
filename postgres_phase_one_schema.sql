CREATE SCHEMA IF NOT EXISTS accounting_normalization;

SET search_path = accounting_normalization, public;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  CREATE TYPE received_channel AS ENUM ('manual_upload', 'shared_folder', 'api', 'backfill');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE file_status AS ENUM ('received', 'duplicate', 'queued', 'processing', 'processed', 'failed', 'ignored');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE report_status AS ENUM (
    'received',
    'classified',
    'parsed',
    'validated',
    'ready',
    'review',
    'blocked',
    'exported',
    'complete',
    'failed',
    'suppressed'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE run_stage AS ENUM ('ingest', 'classify', 'parse', 'validate', 'review', 'export');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE run_status AS ENUM ('queued', 'running', 'succeeded', 'failed', 'canceled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE validation_status AS ENUM ('passed', 'warning', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE review_status AS ENUM ('open', 'assigned', 'corrected', 'approved', 'rejected', 'canceled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE export_status AS ENUM ('queued', 'generated', 'sent', 'accepted', 'failed', 'canceled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE source_file_role AS ENUM ('primary', 'supporting', 'verification', 'duplicate', 'allocation_model');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE parser_profile_type AS ENUM ('config', 'custom', 'hybrid', 'ai_fallback');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE record_type AS ENUM ('summary', 'line_item', 'allocation', 'posting');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE record_status AS ENUM ('ready', 'review', 'blocked', 'suppressed', 'exported');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE TYPE reconciliation_stage AS ENUM ('source', 'normalized', 'export');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS platforms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_key text NOT NULL UNIQUE,
  display_name text NOT NULL,
  default_vertical text,
  default_currency char(3) CHECK (default_currency IS NULL OR default_currency ~ '^[A-Z]{3}$'),
  status text NOT NULL DEFAULT 'active',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS parser_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_id uuid REFERENCES platforms(id),
  profile_key text NOT NULL,
  parser_family text NOT NULL,
  version text NOT NULL,
  config_version text NOT NULL,
  profile_type parser_profile_type NOT NULL,
  media_types text[] NOT NULL DEFAULT ARRAY[]::text[],
  deterministic boolean NOT NULL DEFAULT true,
  enabled boolean NOT NULL DEFAULT true,
  confidence_threshold numeric(5,4) NOT NULL DEFAULT 0.9500 CHECK (confidence_threshold >= 0 AND confidence_threshold <= 1),
  reconciliation_tolerance numeric(20,6) NOT NULL DEFAULT 0.010000 CHECK (reconciliation_tolerance >= 0),
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  retired_at timestamptz,
  UNIQUE (profile_key, version, config_version)
);

CREATE TABLE IF NOT EXISTS source_file_blobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sha256 char(64) NOT NULL UNIQUE CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  byte_size bigint NOT NULL CHECK (byte_size >= 0),
  media_type text NOT NULL,
  original_storage_uri text NOT NULL UNIQUE,
  storage_provider text NOT NULL DEFAULT 'object_storage',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS source_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  blob_id uuid NOT NULL REFERENCES source_file_blobs(id),
  original_file_name text NOT NULL,
  received_channel received_channel NOT NULL,
  received_path text,
  received_by text,
  received_at timestamptz NOT NULL DEFAULT now(),
  platform_id uuid REFERENCES platforms(id),
  parser_profile_id uuid REFERENCES parser_profiles(id),
  duplicate_of_source_file_id uuid REFERENCES source_files(id),
  status file_status NOT NULL DEFAULT 'received',
  source_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  failure_message text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (duplicate_of_source_file_id IS NULL OR duplicate_of_source_file_id <> id)
);

CREATE INDEX IF NOT EXISTS idx_source_files_blob_id ON source_files(blob_id);
CREATE INDEX IF NOT EXISTS idx_source_files_status ON source_files(status);
CREATE INDEX IF NOT EXISTS idx_source_files_platform_id ON source_files(platform_id);
CREATE INDEX IF NOT EXISTS idx_source_files_duplicate_of ON source_files(duplicate_of_source_file_id);

CREATE TABLE IF NOT EXISTS reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_key text NOT NULL UNIQUE,
  platform_id uuid REFERENCES platforms(id),
  parser_profile_id uuid REFERENCES parser_profiles(id),
  parser_family text,
  parser_version text,
  config_version text,
  report_type text,
  report_family text,
  statement_reference text,
  period_start date,
  period_end date,
  period_label text,
  statement_date date,
  invoice_date date,
  due_date date,
  currency char(3) CHECK (currency IS NULL OR currency ~ '^[A-Z]{3}$'),
  status report_status NOT NULL DEFAULT 'received',
  normalized_report jsonb,
  schema_version text,
  classifier_confidence numeric(5,4) CHECK (classifier_confidence IS NULL OR classifier_confidence BETWEEN 0 AND 1),
  review_required boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reports_platform_id ON reports(platform_id);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);
CREATE INDEX IF NOT EXISTS idx_reports_period ON reports(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_reports_parser_snapshot ON reports(parser_family, parser_version, config_version);

CREATE TABLE IF NOT EXISTS report_source_files (
  report_id uuid NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  source_file_id uuid NOT NULL REFERENCES source_files(id),
  role source_file_role NOT NULL,
  authoritative boolean NOT NULL DEFAULT false,
  source_locator text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (report_id, source_file_id, role)
);

CREATE INDEX IF NOT EXISTS idx_report_source_files_source ON report_source_files(source_file_id);

CREATE TABLE IF NOT EXISTS processing_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_file_id uuid REFERENCES source_files(id),
  report_id uuid REFERENCES reports(id),
  parser_profile_id uuid REFERENCES parser_profiles(id),
  stage run_stage NOT NULL,
  status run_status NOT NULL DEFAULT 'queued',
  started_at timestamptz,
  finished_at timestamptz,
  worker_id text,
  input_sha256 char(64) CHECK (input_sha256 IS NULL OR input_sha256 ~ '^[a-f0-9]{64}$'),
  parser_family text,
  parser_version text,
  config_version text,
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_code text,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (finished_at IS NULL OR started_at IS NULL OR finished_at >= started_at)
);

CREATE INDEX IF NOT EXISTS idx_processing_runs_source_file_id ON processing_runs(source_file_id);
CREATE INDEX IF NOT EXISTS idx_processing_runs_report_id ON processing_runs(report_id);
CREATE INDEX IF NOT EXISTS idx_processing_runs_stage_status ON processing_runs(stage, status);

CREATE TABLE IF NOT EXISTS report_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  record_key text NOT NULL,
  record_type record_type NOT NULL,
  status record_status NOT NULL DEFAULT 'ready',
  normalized_json jsonb NOT NULL,
  amount numeric(20,6),
  currency char(3) CHECK (currency IS NULL OR currency ~ '^[A-Z]{3}$'),
  parser_profile_id uuid REFERENCES parser_profiles(id),
  parser_family text,
  parser_version text,
  config_version text,
  source_line_ids text[] NOT NULL DEFAULT ARRAY[]::text[],
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (report_id, record_key)
);

CREATE INDEX IF NOT EXISTS idx_report_records_report_id ON report_records(report_id);
CREATE INDEX IF NOT EXISTS idx_report_records_type_status ON report_records(record_type, status);
CREATE INDEX IF NOT EXISTS idx_report_records_parser_snapshot ON report_records(parser_family, parser_version, config_version);
CREATE INDEX IF NOT EXISTS idx_report_records_normalized_json ON report_records USING gin(normalized_json);

CREATE TABLE IF NOT EXISTS field_provenance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  report_record_id uuid REFERENCES report_records(id) ON DELETE CASCADE,
  field_path text NOT NULL,
  value_json jsonb,
  source_file_id uuid NOT NULL REFERENCES source_files(id),
  source_sheet text,
  source_page integer CHECK (source_page IS NULL OR source_page >= 1),
  source_row integer CHECK (source_row IS NULL OR source_row >= 1),
  source_column text,
  source_cell_range text,
  image_name text,
  parser_profile_id uuid REFERENCES parser_profiles(id),
  parser_family text,
  parser_version text,
  config_version text,
  extraction_confidence numeric(5,4) CHECK (extraction_confidence IS NULL OR extraction_confidence BETWEEN 0 AND 1),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_field_provenance_report_id ON field_provenance(report_id);
CREATE INDEX IF NOT EXISTS idx_field_provenance_record_id ON field_provenance(report_record_id);
CREATE INDEX IF NOT EXISTS idx_field_provenance_source_file_id ON field_provenance(source_file_id);
CREATE INDEX IF NOT EXISTS idx_field_provenance_field_path ON field_provenance(field_path);

CREATE TABLE IF NOT EXISTS validation_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  report_record_id uuid REFERENCES report_records(id) ON DELETE CASCADE,
  processing_run_id uuid REFERENCES processing_runs(id),
  check_name text NOT NULL,
  status validation_status NOT NULL,
  severity text NOT NULL DEFAULT 'error',
  message text NOT NULL,
  declared_amount numeric(20,6),
  computed_amount numeric(20,6),
  difference_amount numeric(20,6),
  tolerance_amount numeric(20,6),
  currency char(3) CHECK (currency IS NULL OR currency ~ '^[A-Z]{3}$'),
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_validation_results_report_id ON validation_results(report_id);
CREATE INDEX IF NOT EXISTS idx_validation_results_record_id ON validation_results(report_record_id);
CREATE INDEX IF NOT EXISTS idx_validation_results_status ON validation_results(status);
CREATE INDEX IF NOT EXISTS idx_validation_results_check_name ON validation_results(check_name);

CREATE TABLE IF NOT EXISTS review_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  report_record_id uuid REFERENCES report_records(id) ON DELETE CASCADE,
  validation_result_id uuid REFERENCES validation_results(id),
  status review_status NOT NULL DEFAULT 'open',
  priority integer NOT NULL DEFAULT 3 CHECK (priority BETWEEN 1 AND 5),
  reason text NOT NULL,
  assigned_to text,
  original_value jsonb,
  proposed_value jsonb,
  corrected_value jsonb,
  approval_notes text,
  approved_by text,
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_review_items_report_id ON review_items(report_id);
CREATE INDEX IF NOT EXISTS idx_review_items_record_id ON review_items(report_record_id);
CREATE INDEX IF NOT EXISTS idx_review_items_status_priority ON review_items(status, priority);

CREATE TABLE IF NOT EXISTS reconciliation_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  stage reconciliation_stage NOT NULL,
  amount numeric(20,6),
  currency char(3) CHECK (currency IS NULL OR currency ~ '^[A-Z]{3}$'),
  record_count integer NOT NULL DEFAULT 0 CHECK (record_count >= 0),
  validation_status validation_status NOT NULL DEFAULT 'passed',
  tolerance_amount numeric(20,6) NOT NULL DEFAULT 0.010000 CHECK (tolerance_amount >= 0),
  components jsonb NOT NULL DEFAULT '{}'::jsonb,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  captured_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reconciliation_snapshots_report_stage ON reconciliation_snapshots(report_id, stage, captured_at DESC);

CREATE TABLE IF NOT EXISTS exports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  destination text NOT NULL DEFAULT 'airtable',
  destination_base_id text,
  destination_table text,
  export_format text NOT NULL DEFAULT 'airtable_api',
  status export_status NOT NULL DEFAULT 'queued',
  idempotency_key text NOT NULL UNIQUE,
  record_count integer NOT NULL DEFAULT 0 CHECK (record_count >= 0),
  source_total numeric(20,6),
  normalized_total numeric(20,6),
  export_total numeric(20,6),
  currency char(3) CHECK (currency IS NULL OR currency ~ '^[A-Z]{3}$'),
  difference_source_normalized numeric(20,6),
  difference_normalized_export numeric(20,6),
  payload jsonb NOT NULL,
  destination_response jsonb,
  destination_batch_id text,
  generated_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  accepted_at timestamptz,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_exports_report_id ON exports(report_id);
CREATE INDEX IF NOT EXISTS idx_exports_status ON exports(status);
CREATE INDEX IF NOT EXISTS idx_exports_destination ON exports(destination, destination_table);

CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION prevent_file_blob_mutation()
RETURNS trigger AS $$
BEGIN
  IF NEW.sha256 <> OLD.sha256
     OR NEW.byte_size <> OLD.byte_size
     OR NEW.media_type <> OLD.media_type
     OR NEW.original_storage_uri <> OLD.original_storage_uri
     OR NEW.storage_provider <> OLD.storage_provider THEN
    RAISE EXCEPTION 'source_file_blobs are immutable after insert';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION prevent_source_file_origin_mutation()
RETURNS trigger AS $$
BEGIN
  IF NEW.blob_id <> OLD.blob_id
     OR NEW.original_file_name <> OLD.original_file_name
     OR NEW.received_channel <> OLD.received_channel
     OR COALESCE(NEW.received_path, '') <> COALESCE(OLD.received_path, '')
     OR NEW.received_at <> OLD.received_at THEN
    RAISE EXCEPTION 'source file origin fields are immutable after insert';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION enforce_report_completion_gate()
RETURNS trigger AS $$
DECLARE
  failed_validation_count integer;
  open_review_count integer;
  source_total numeric(20,6);
  normalized_total numeric(20,6);
  export_total numeric(20,6);
  tolerance numeric(20,6);
BEGIN
  IF NEW.status <> 'complete' THEN
    RETURN NEW;
  END IF;

  SELECT count(*)
  INTO failed_validation_count
  FROM validation_results
  WHERE report_id = NEW.id
    AND status = 'failed';

  IF failed_validation_count > 0 THEN
    RAISE EXCEPTION 'report % cannot be completed with failed validation results', NEW.id;
  END IF;

  SELECT count(*)
  INTO open_review_count
  FROM review_items
  WHERE report_id = NEW.id
    AND status IN ('open', 'assigned', 'corrected');

  IF open_review_count > 0 THEN
    RAISE EXCEPTION 'report % cannot be completed with open review items', NEW.id;
  END IF;

  SELECT amount, tolerance_amount
  INTO source_total, tolerance
  FROM reconciliation_snapshots
  WHERE report_id = NEW.id
    AND stage = 'source'
  ORDER BY captured_at DESC
  LIMIT 1;

  SELECT amount
  INTO normalized_total
  FROM reconciliation_snapshots
  WHERE report_id = NEW.id
    AND stage = 'normalized'
  ORDER BY captured_at DESC
  LIMIT 1;

  SELECT amount
  INTO export_total
  FROM reconciliation_snapshots
  WHERE report_id = NEW.id
    AND stage = 'export'
  ORDER BY captured_at DESC
  LIMIT 1;

  IF tolerance IS NULL THEN
    tolerance := 0.010000;
  END IF;

  IF source_total IS NULL OR normalized_total IS NULL OR export_total IS NULL THEN
    RAISE EXCEPTION 'report % cannot be completed without source, normalized, and export totals', NEW.id;
  END IF;

  IF abs(source_total - normalized_total) > tolerance THEN
    RAISE EXCEPTION 'report % cannot be completed: source total % and normalized total % differ by more than %',
      NEW.id, source_total, normalized_total, tolerance;
  END IF;

  IF abs(normalized_total - export_total) > tolerance THEN
    RAISE EXCEPTION 'report % cannot be completed: normalized total % and export total % differ by more than %',
      NEW.id, normalized_total, export_total, tolerance;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_platforms_touch_updated_at ON platforms;
CREATE TRIGGER trg_platforms_touch_updated_at
BEFORE UPDATE ON platforms
FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

DROP TRIGGER IF EXISTS trg_source_files_touch_updated_at ON source_files;
CREATE TRIGGER trg_source_files_touch_updated_at
BEFORE UPDATE ON source_files
FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

DROP TRIGGER IF EXISTS trg_reports_touch_updated_at ON reports;
CREATE TRIGGER trg_reports_touch_updated_at
BEFORE UPDATE ON reports
FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

DROP TRIGGER IF EXISTS trg_report_records_touch_updated_at ON report_records;
CREATE TRIGGER trg_report_records_touch_updated_at
BEFORE UPDATE ON report_records
FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

DROP TRIGGER IF EXISTS trg_review_items_touch_updated_at ON review_items;
CREATE TRIGGER trg_review_items_touch_updated_at
BEFORE UPDATE ON review_items
FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

DROP TRIGGER IF EXISTS trg_exports_touch_updated_at ON exports;
CREATE TRIGGER trg_exports_touch_updated_at
BEFORE UPDATE ON exports
FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

DROP TRIGGER IF EXISTS trg_source_file_blobs_immutable ON source_file_blobs;
CREATE TRIGGER trg_source_file_blobs_immutable
BEFORE UPDATE ON source_file_blobs
FOR EACH ROW EXECUTE FUNCTION prevent_file_blob_mutation();

DROP TRIGGER IF EXISTS trg_source_files_origin_immutable ON source_files;
CREATE TRIGGER trg_source_files_origin_immutable
BEFORE UPDATE ON source_files
FOR EACH ROW EXECUTE FUNCTION prevent_source_file_origin_mutation();

DROP TRIGGER IF EXISTS trg_reports_completion_gate ON reports;
CREATE TRIGGER trg_reports_completion_gate
BEFORE UPDATE OF status ON reports
FOR EACH ROW EXECUTE FUNCTION enforce_report_completion_gate();

CREATE OR REPLACE VIEW admin_file_dashboard AS
SELECT
  count(*) AS files_received,
  count(*) FILTER (WHERE sf.status = 'processed') AS files_processed,
  count(*) FILTER (WHERE sf.status = 'duplicate') AS duplicate_files,
  count(*) FILTER (WHERE sf.status = 'failed') AS failed_files,
  count(*) FILTER (
    WHERE EXISTS (
      SELECT 1
      FROM report_source_files rsf
      JOIN review_items ri ON ri.report_id = rsf.report_id
      WHERE rsf.source_file_id = sf.id
        AND ri.status IN ('open', 'assigned', 'corrected')
    )
  ) AS files_awaiting_review
FROM source_files sf;

CREATE OR REPLACE VIEW admin_report_reconciliation AS
WITH latest_source AS (
  SELECT DISTINCT ON (report_id)
    report_id,
    amount,
    currency,
    record_count,
    tolerance_amount,
    validation_status,
    captured_at
  FROM reconciliation_snapshots
  WHERE stage = 'source'
  ORDER BY report_id, captured_at DESC
),
latest_normalized AS (
  SELECT DISTINCT ON (report_id)
    report_id,
    amount,
    currency,
    record_count,
    validation_status,
    captured_at
  FROM reconciliation_snapshots
  WHERE stage = 'normalized'
  ORDER BY report_id, captured_at DESC
),
latest_export AS (
  SELECT DISTINCT ON (report_id)
    report_id,
    amount,
    currency,
    record_count,
    validation_status,
    captured_at
  FROM reconciliation_snapshots
  WHERE stage = 'export'
  ORDER BY report_id, captured_at DESC
),
validation_counts AS (
  SELECT
    report_id,
    count(*) FILTER (WHERE status = 'failed') AS failed_validation_count,
    count(*) FILTER (WHERE status = 'warning') AS warning_validation_count
  FROM validation_results
  GROUP BY report_id
),
review_counts AS (
  SELECT
    report_id,
    count(*) FILTER (WHERE status IN ('open', 'assigned', 'corrected')) AS open_review_count
  FROM review_items
  GROUP BY report_id
)
SELECT
  r.id AS report_id,
  r.report_key,
  p.display_name AS platform,
  r.status,
  r.period_start,
  r.period_end,
  r.currency,
  ls.amount AS source_total,
  ln.amount AS normalized_total,
  le.amount AS export_total,
  ln.amount - ls.amount AS source_to_normalized_difference,
  le.amount - ln.amount AS normalized_to_export_difference,
  COALESCE(vc.failed_validation_count, 0) AS failed_validation_count,
  COALESCE(vc.warning_validation_count, 0) AS warning_validation_count,
  COALESCE(rc.open_review_count, 0) AS open_review_count,
  COALESCE(ls.tolerance_amount, 0.010000) AS tolerance_amount
FROM reports r
LEFT JOIN platforms p ON p.id = r.platform_id
LEFT JOIN latest_source ls ON ls.report_id = r.id
LEFT JOIN latest_normalized ln ON ln.report_id = r.id
LEFT JOIN latest_export le ON le.report_id = r.id
LEFT JOIN validation_counts vc ON vc.report_id = r.id
LEFT JOIN review_counts rc ON rc.report_id = r.id;

CREATE OR REPLACE VIEW airtable_export_ready AS
SELECT
  r.id AS report_id,
  r.report_key,
  rr.id AS report_record_id,
  rr.record_key,
  rr.normalized_json ->> 'customer' AS customer,
  rr.normalized_json ->> 'studio' AS studio,
  rr.normalized_json #>> '{amount,amount}' AS amount,
  rr.normalized_json #>> '{amount,currency}' AS currency,
  rr.normalized_json ->> 'memo' AS memo,
  rr.normalized_json ->> 'invoice_date' AS invoice_date,
  rr.normalized_json ->> 'due_date' AS due_date,
  rr.normalized_json ->> 'vertical' AS vertical,
  rr.normalized_json ->> 'invoice_number' AS invoice_number,
  rr.normalized_json AS posting_json
FROM report_records rr
JOIN reports r ON r.id = rr.report_id
WHERE rr.record_type = 'posting'
  AND rr.status = 'ready'
  AND r.status IN ('ready', 'validated', 'exported')
  AND NOT EXISTS (
    SELECT 1
    FROM validation_results vr
    WHERE vr.report_id = r.id
      AND vr.status = 'failed'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM review_items ri
    WHERE ri.report_id = r.id
      AND ri.status IN ('open', 'assigned', 'corrected')
  );

