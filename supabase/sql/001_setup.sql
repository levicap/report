create extension if not exists pgcrypto;

do $$
begin
  create type received_channel as enum ('manual_upload', 'shared_folder', 'api', 'backfill');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type source_file_status as enum ('received', 'duplicate', 'queued', 'processing', 'processed', 'failed', 'ignored');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type normalized_report_status as enum (
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
exception when duplicate_object then null;
end $$;

do $$
begin
  create type run_stage as enum ('ingest', 'classify', 'parse', 'validate', 'review', 'export');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type run_status as enum ('queued', 'running', 'succeeded', 'failed', 'canceled');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type validation_status as enum ('passed', 'warning', 'failed');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type review_status as enum ('open', 'assigned', 'corrected', 'approved', 'rejected', 'canceled');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type export_status as enum ('queued', 'generated', 'sent', 'accepted', 'failed', 'canceled');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type source_file_role as enum ('primary', 'supporting', 'verification', 'duplicate', 'allocation_model');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type parser_profile_type as enum ('config', 'custom', 'hybrid', 'ai_fallback');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type report_record_type as enum ('summary', 'line_item', 'allocation', 'posting');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type report_record_status as enum ('ready', 'review', 'blocked', 'suppressed', 'exported');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type reconciliation_stage as enum ('source', 'normalized', 'export');
exception when duplicate_object then null;
end $$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'source-files',
  'source-files',
  false,
  104857600,
  array[
    'text/csv',
    'application/pdf',
    'image/png',
    'image/jpeg',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel'
  ]
)
on conflict (id) do nothing;

create table if not exists platforms (
  id uuid primary key default gen_random_uuid(),
  platform_key text not null unique,
  display_name text not null,
  default_vertical text,
  default_currency char(3) check (default_currency is null or default_currency ~ '^[A-Z]{3}$'),
  status text not null default 'active',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists parser_profiles (
  id uuid primary key default gen_random_uuid(),
  platform_id uuid references platforms(id),
  profile_key text not null,
  parser_family text not null,
  version text not null,
  config_version text not null,
  profile_type parser_profile_type not null,
  media_types text[] not null default array[]::text[],
  deterministic boolean not null default true,
  enabled boolean not null default true,
  confidence_threshold numeric(5,4) not null default 0.9500 check (confidence_threshold >= 0 and confidence_threshold <= 1),
  reconciliation_tolerance numeric(20,6) not null default 0.010000 check (reconciliation_tolerance >= 0),
  config jsonb not null default '{}'::jsonb,
  notes text,
  created_at timestamptz not null default now(),
  retired_at timestamptz,
  unique (profile_key, version, config_version)
);

create table if not exists source_file_blobs (
  id uuid primary key default gen_random_uuid(),
  sha256 char(64) not null unique check (sha256 ~ '^[a-f0-9]{64}$'),
  byte_size bigint not null check (byte_size >= 0),
  media_type text not null,
  original_storage_uri text not null unique,
  storage_provider text not null default 'supabase_storage',
  created_at timestamptz not null default now()
);

create table if not exists source_files (
  id uuid primary key default gen_random_uuid(),
  blob_id uuid not null references source_file_blobs(id),
  original_file_name text not null,
  received_channel received_channel not null,
  received_path text,
  received_by text,
  received_at timestamptz not null default now(),
  platform_id uuid references platforms(id),
  parser_profile_id uuid references parser_profiles(id),
  duplicate_of_source_file_id uuid references source_files(id),
  status source_file_status not null default 'received',
  source_metadata jsonb not null default '{}'::jsonb,
  failure_message text,
  updated_at timestamptz not null default now(),
  check (duplicate_of_source_file_id is null or duplicate_of_source_file_id <> id)
);

create index if not exists idx_source_files_blob_id on source_files(blob_id);
create index if not exists idx_source_files_status on source_files(status);
create index if not exists idx_source_files_platform_id on source_files(platform_id);
create index if not exists idx_source_files_duplicate_of on source_files(duplicate_of_source_file_id);

create table if not exists reports (
  id uuid primary key default gen_random_uuid(),
  report_key text not null unique,
  platform_id uuid references platforms(id),
  parser_profile_id uuid references parser_profiles(id),
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
  currency char(3) check (currency is null or currency ~ '^[A-Z]{3}$'),
  status normalized_report_status not null default 'received',
  normalized_report jsonb,
  schema_version text,
  classifier_confidence numeric(5,4) check (classifier_confidence is null or classifier_confidence between 0 and 1),
  review_required boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_reports_platform_id on reports(platform_id);
create index if not exists idx_reports_status on reports(status);
create index if not exists idx_reports_period on reports(period_start, period_end);
create index if not exists idx_reports_parser_snapshot on reports(parser_family, parser_version, config_version);

create table if not exists report_source_files (
  report_id uuid not null references reports(id) on delete cascade,
  source_file_id uuid not null references source_files(id),
  role source_file_role not null,
  authoritative boolean not null default false,
  source_locator text,
  created_at timestamptz not null default now(),
  primary key (report_id, source_file_id, role)
);

create table if not exists processing_runs (
  id uuid primary key default gen_random_uuid(),
  source_file_id uuid references source_files(id),
  report_id uuid references reports(id),
  parser_profile_id uuid references parser_profiles(id),
  stage run_stage not null,
  status run_status not null default 'queued',
  started_at timestamptz,
  finished_at timestamptz,
  worker_id text,
  input_sha256 char(64) check (input_sha256 is null or input_sha256 ~ '^[a-f0-9]{64}$'),
  parser_family text,
  parser_version text,
  config_version text,
  metrics jsonb not null default '{}'::jsonb,
  error_code text,
  error_message text,
  created_at timestamptz not null default now(),
  check (finished_at is null or started_at is null or finished_at >= started_at)
);

create index if not exists idx_processing_runs_source_file_id on processing_runs(source_file_id);
create index if not exists idx_processing_runs_report_id on processing_runs(report_id);
create index if not exists idx_processing_runs_stage_status on processing_runs(stage, status);

create table if not exists report_records (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references reports(id) on delete cascade,
  record_key text not null,
  record_type report_record_type not null,
  status report_record_status not null default 'ready',
  normalized_json jsonb not null,
  amount numeric(20,6),
  currency char(3) check (currency is null or currency ~ '^[A-Z]{3}$'),
  parser_profile_id uuid references parser_profiles(id),
  parser_family text,
  parser_version text,
  config_version text,
  source_line_ids text[] not null default array[]::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (report_id, record_key)
);

create index if not exists idx_report_records_report_id on report_records(report_id);
create index if not exists idx_report_records_type_status on report_records(record_type, status);
create index if not exists idx_report_records_normalized_json on report_records using gin(normalized_json);

create table if not exists field_provenance (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references reports(id) on delete cascade,
  report_record_id uuid references report_records(id) on delete cascade,
  field_path text not null,
  value_json jsonb,
  source_file_id uuid not null references source_files(id),
  source_sheet text,
  source_page integer check (source_page is null or source_page >= 1),
  source_row integer check (source_row is null or source_row >= 1),
  source_column text,
  source_cell_range text,
  image_name text,
  parser_profile_id uuid references parser_profiles(id),
  parser_family text,
  parser_version text,
  config_version text,
  extraction_confidence numeric(5,4) check (extraction_confidence is null or extraction_confidence between 0 and 1),
  created_at timestamptz not null default now()
);

create index if not exists idx_field_provenance_report_id on field_provenance(report_id);
create index if not exists idx_field_provenance_source_file_id on field_provenance(source_file_id);
create index if not exists idx_field_provenance_field_path on field_provenance(field_path);

create table if not exists validation_results (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references reports(id) on delete cascade,
  report_record_id uuid references report_records(id) on delete cascade,
  processing_run_id uuid references processing_runs(id),
  check_name text not null,
  status validation_status not null,
  severity text not null default 'error',
  message text not null,
  declared_amount numeric(20,6),
  computed_amount numeric(20,6),
  difference_amount numeric(20,6),
  tolerance_amount numeric(20,6),
  currency char(3) check (currency is null or currency ~ '^[A-Z]{3}$'),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_validation_results_report_id on validation_results(report_id);
create index if not exists idx_validation_results_status on validation_results(status);
create index if not exists idx_validation_results_check_name on validation_results(check_name);

create table if not exists review_items (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references reports(id) on delete cascade,
  report_record_id uuid references report_records(id) on delete cascade,
  validation_result_id uuid references validation_results(id),
  status review_status not null default 'open',
  priority integer not null default 3 check (priority between 1 and 5),
  reason text not null,
  assigned_to text,
  original_value jsonb,
  proposed_value jsonb,
  corrected_value jsonb,
  approval_notes text,
  approved_by text,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_review_items_report_id on review_items(report_id);
create index if not exists idx_review_items_status_priority on review_items(status, priority);

create table if not exists reconciliation_snapshots (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references reports(id) on delete cascade,
  stage reconciliation_stage not null,
  amount numeric(20,6),
  currency char(3) check (currency is null or currency ~ '^[A-Z]{3}$'),
  record_count integer not null default 0 check (record_count >= 0),
  validation_status validation_status not null default 'passed',
  tolerance_amount numeric(20,6) not null default 0.010000 check (tolerance_amount >= 0),
  components jsonb not null default '{}'::jsonb,
  details jsonb not null default '{}'::jsonb,
  captured_at timestamptz not null default now()
);

create index if not exists idx_reconciliation_report_stage on reconciliation_snapshots(report_id, stage, captured_at desc);

create table if not exists exports (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references reports(id) on delete cascade,
  destination text not null default 'airtable',
  destination_base_id text,
  destination_table text,
  export_format text not null default 'airtable_api',
  status export_status not null default 'generated',
  idempotency_key text not null unique,
  record_count integer not null default 0 check (record_count >= 0),
  source_total numeric(20,6),
  normalized_total numeric(20,6),
  export_total numeric(20,6),
  currency char(3) check (currency is null or currency ~ '^[A-Z]{3}$'),
  difference_source_normalized numeric(20,6),
  difference_normalized_export numeric(20,6),
  payload jsonb not null,
  destination_response jsonb,
  destination_batch_id text,
  generated_at timestamptz not null default now(),
  sent_at timestamptz,
  accepted_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_exports_report_id on exports(report_id);
create index if not exists idx_exports_status on exports(status);

create or replace function touch_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create or replace function prevent_file_blob_mutation()
returns trigger as $$
begin
  if new.sha256 <> old.sha256
     or new.byte_size <> old.byte_size
     or new.media_type <> old.media_type
     or new.original_storage_uri <> old.original_storage_uri
     or new.storage_provider <> old.storage_provider then
    raise exception 'source_file_blobs are immutable after insert';
  end if;
  return new;
end;
$$ language plpgsql;

create or replace function enforce_report_completion_gate()
returns trigger as $$
declare
  failed_validation_count integer;
  open_review_count integer;
  source_total numeric(20,6);
  normalized_total numeric(20,6);
  export_total numeric(20,6);
  tolerance numeric(20,6);
begin
  if new.status <> 'complete' then
    return new;
  end if;

  select count(*) into failed_validation_count
  from validation_results
  where report_id = new.id
    and status = 'failed';

  if failed_validation_count > 0 then
    raise exception 'report % cannot be completed with failed validations', new.id;
  end if;

  select count(*) into open_review_count
  from review_items
  where report_id = new.id
    and status in ('open', 'assigned', 'corrected');

  if open_review_count > 0 then
    raise exception 'report % cannot be completed with open review items', new.id;
  end if;

  select amount, tolerance_amount into source_total, tolerance
  from reconciliation_snapshots
  where report_id = new.id and stage = 'source'
  order by captured_at desc
  limit 1;

  select amount into normalized_total
  from reconciliation_snapshots
  where report_id = new.id and stage = 'normalized'
  order by captured_at desc
  limit 1;

  select amount into export_total
  from reconciliation_snapshots
  where report_id = new.id and stage = 'export'
  order by captured_at desc
  limit 1;

  tolerance := coalesce(tolerance, 0.010000);

  if source_total is null or normalized_total is null or export_total is null then
    raise exception 'report % cannot be completed without source, normalized, and export totals', new.id;
  end if;

  if abs(source_total - normalized_total) > tolerance then
    raise exception 'report % source total and normalized total do not reconcile', new.id;
  end if;

  if abs(normalized_total - export_total) > tolerance then
    raise exception 'report % normalized total and export total do not reconcile', new.id;
  end if;

  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_platforms_touch_updated_at on platforms;
create trigger trg_platforms_touch_updated_at before update on platforms for each row execute function touch_updated_at();

drop trigger if exists trg_source_files_touch_updated_at on source_files;
create trigger trg_source_files_touch_updated_at before update on source_files for each row execute function touch_updated_at();

drop trigger if exists trg_reports_touch_updated_at on reports;
create trigger trg_reports_touch_updated_at before update on reports for each row execute function touch_updated_at();

drop trigger if exists trg_report_records_touch_updated_at on report_records;
create trigger trg_report_records_touch_updated_at before update on report_records for each row execute function touch_updated_at();

drop trigger if exists trg_review_items_touch_updated_at on review_items;
create trigger trg_review_items_touch_updated_at before update on review_items for each row execute function touch_updated_at();

drop trigger if exists trg_exports_touch_updated_at on exports;
create trigger trg_exports_touch_updated_at before update on exports for each row execute function touch_updated_at();

drop trigger if exists trg_source_file_blobs_immutable on source_file_blobs;
create trigger trg_source_file_blobs_immutable before update on source_file_blobs for each row execute function prevent_file_blob_mutation();

drop trigger if exists trg_reports_completion_gate on reports;
create trigger trg_reports_completion_gate before update of status on reports for each row execute function enforce_report_completion_gate();

alter table platforms enable row level security;
alter table parser_profiles enable row level security;
alter table source_file_blobs enable row level security;
alter table source_files enable row level security;
alter table reports enable row level security;
alter table report_source_files enable row level security;
alter table processing_runs enable row level security;
alter table report_records enable row level security;
alter table field_provenance enable row level security;
alter table validation_results enable row level security;
alter table review_items enable row level security;
alter table reconciliation_snapshots enable row level security;
alter table exports enable row level security;

create or replace view admin_file_dashboard with (security_invoker = on) as
select
  count(*) as files_received,
  count(*) filter (where sf.status = 'processed') as files_processed,
  count(*) filter (where sf.status = 'duplicate') as duplicate_files,
  count(*) filter (where sf.status = 'failed') as failed_files,
  count(*) filter (
    where exists (
      select 1
      from report_source_files rsf
      join review_items ri on ri.report_id = rsf.report_id
      where rsf.source_file_id = sf.id
        and ri.status in ('open', 'assigned', 'corrected')
    )
  ) as files_awaiting_review
from source_files sf;

create or replace view admin_report_reconciliation with (security_invoker = on) as
with latest_source as (
  select distinct on (report_id) report_id, amount, currency, record_count, tolerance_amount, validation_status, captured_at
  from reconciliation_snapshots
  where stage = 'source'
  order by report_id, captured_at desc
),
latest_normalized as (
  select distinct on (report_id) report_id, amount, currency, record_count, validation_status, captured_at
  from reconciliation_snapshots
  where stage = 'normalized'
  order by report_id, captured_at desc
),
latest_export as (
  select distinct on (report_id) report_id, amount, currency, record_count, validation_status, captured_at
  from reconciliation_snapshots
  where stage = 'export'
  order by report_id, captured_at desc
),
validation_counts as (
  select
    report_id,
    count(*) filter (where status = 'failed') as failed_validation_count,
    count(*) filter (where status = 'warning') as warning_validation_count
  from validation_results
  group by report_id
),
review_counts as (
  select
    report_id,
    count(*) filter (where status in ('open', 'assigned', 'corrected')) as open_review_count
  from review_items
  group by report_id
)
select
  r.id as report_id,
  r.report_key,
  coalesce(
    p.display_name,
    r.normalized_report #>> '{source,reporting_party,canonical_name}',
    r.normalized_report #>> '{source,reporting_party,source_name}'
  ) as platform,
  r.status,
  r.period_start,
  r.period_end,
  r.currency,
  ls.amount as source_total,
  ln.amount as normalized_total,
  le.amount as export_total,
  ln.amount - ls.amount as source_to_normalized_difference,
  le.amount - ln.amount as normalized_to_export_difference,
  coalesce(vc.failed_validation_count, 0) as failed_validation_count,
  coalesce(vc.warning_validation_count, 0) as warning_validation_count,
  coalesce(rc.open_review_count, 0) as open_review_count,
  coalesce(ls.tolerance_amount, 0.010000) as tolerance_amount
from reports r
left join platforms p on p.id = r.platform_id
left join latest_source ls on ls.report_id = r.id
left join latest_normalized ln on ln.report_id = r.id
left join latest_export le on le.report_id = r.id
left join validation_counts vc on vc.report_id = r.id
left join review_counts rc on rc.report_id = r.id;

create or replace view airtable_export_ready with (security_invoker = on) as
select
  r.id as report_id,
  r.report_key,
  rr.id as report_record_id,
  rr.record_key,
  rr.normalized_json ->> 'customer' as customer,
  rr.normalized_json ->> 'studio' as studio,
  rr.normalized_json #>> '{amount,amount}' as amount,
  rr.normalized_json #>> '{amount,currency}' as currency,
  rr.normalized_json ->> 'memo' as memo,
  rr.normalized_json ->> 'invoice_date' as invoice_date,
  rr.normalized_json ->> 'due_date' as due_date,
  rr.normalized_json ->> 'vertical' as vertical,
  rr.normalized_json ->> 'invoice_number' as invoice_number,
  rr.normalized_json as posting_json
from report_records rr
join reports r on r.id = rr.report_id
where rr.record_type = 'posting'
  and rr.status = 'ready'
  and r.status in ('ready', 'validated', 'exported')
  and not exists (
    select 1 from validation_results vr
    where vr.report_id = r.id and vr.status = 'failed'
  )
  and not exists (
    select 1 from review_items ri
    where ri.report_id = r.id and ri.status in ('open', 'assigned', 'corrected')
  );
