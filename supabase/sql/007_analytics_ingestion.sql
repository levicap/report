-- Analytics ingestion layer.
-- Run after supabase/sql/001_setup.sql so pgcrypto and storage are available.

insert into storage.buckets (id, name, public)
values ('source-files', 'source-files', false)
on conflict (id) do nothing;

create table if not exists analytics_clients (
  id uuid primary key default gen_random_uuid(),
  client_key text not null unique,
  display_name text not null,
  parser_family text not null,
  vertical text,
  currency text,
  enabled boolean not null default true,
  mapping_config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists analytics_source_files (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references analytics_clients(id),
  original_file_name text not null,
  sha256 text not null unique,
  byte_size bigint not null,
  media_type text not null,
  storage_uri text,
  duplicate_of_source_file_id uuid references analytics_source_files(id),
  status text not null default 'uploaded' check (status in ('uploaded', 'duplicate', 'processing', 'processed', 'failed')),
  error_message text,
  uploaded_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists analytics_reports (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references analytics_clients(id),
  source_file_id uuid references analytics_source_files(id),
  report_key text not null unique,
  vendor text,
  report_family text,
  parser_family text not null,
  parser_version text,
  config_version text,
  status text not null default 'review' check (status in ('ready', 'review', 'blocked', 'suppressed', 'failed')),
  source_file_name text not null,
  source_sha256 text not null,
  period_start date,
  period_end date,
  period_label text,
  currency text,
  source_total numeric(18, 6),
  line_items_total numeric(18, 6),
  postings_total numeric(18, 6),
  total_difference numeric(18, 6),
  canonical_report_json jsonb not null,
  parser_output_json jsonb not null,
  classification_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists analytics_raw_tables (
  id uuid primary key default gen_random_uuid(),
  analytics_report_id uuid not null references analytics_reports(id) on delete cascade,
  table_key text not null,
  table_name text not null,
  table_type text not null,
  row_count integer not null default 0,
  column_count integer not null default 0,
  columns jsonb not null default '[]'::jsonb,
  rows_json jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (analytics_report_id, table_key)
);

create table if not exists analytics_report_lines (
  id uuid primary key default gen_random_uuid(),
  analytics_report_id uuid not null references analytics_reports(id) on delete cascade,
  line_id text not null,
  line_index integer not null,
  source_line_id text,
  vendor text,
  report_family text,
  customer text,
  title text,
  source_title_id text,
  source_studio text,
  canonical_studio text,
  source_customer text,
  platform text,
  territory text,
  product_type text,
  quantity numeric(18, 6),
  gross_amount numeric(18, 6),
  fee_amount numeric(18, 6),
  expense_amount numeric(18, 6),
  net_amount numeric(18, 6),
  royalty_amount numeric(18, 6),
  royalty_rate numeric(18, 8),
  sales_count numeric(18, 6),
  download_count numeric(18, 6),
  rental_count numeric(18, 6),
  stream_count numeric(18, 6),
  duration_seconds numeric(18, 6),
  currency text,
  period_start date,
  period_end date,
  raw_fields jsonb not null default '{}'::jsonb,
  source_location jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (analytics_report_id, line_id)
);

alter table analytics_report_lines add column if not exists vendor text;
alter table analytics_report_lines add column if not exists report_family text;
alter table analytics_report_lines add column if not exists customer text;
alter table analytics_report_lines add column if not exists sales_count numeric(18, 6);
alter table analytics_report_lines add column if not exists download_count numeric(18, 6);
alter table analytics_report_lines add column if not exists rental_count numeric(18, 6);
alter table analytics_report_lines add column if not exists stream_count numeric(18, 6);
alter table analytics_report_lines add column if not exists duration_seconds numeric(18, 6);

create table if not exists analytics_report_totals (
  id uuid primary key default gen_random_uuid(),
  analytics_report_id uuid not null unique references analytics_reports(id) on delete cascade,
  source_total numeric(18, 6),
  line_items_total numeric(18, 6),
  postings_total numeric(18, 6),
  difference numeric(18, 6),
  currency text,
  validation_status text,
  warnings jsonb not null default '[]'::jsonb,
  errors jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists analytics_field_provenance (
  id uuid primary key default gen_random_uuid(),
  analytics_report_id uuid not null references analytics_reports(id) on delete cascade,
  source_line_id text,
  field_path text not null,
  value_json jsonb,
  source_sheet text,
  source_page integer,
  source_row integer,
  source_column text,
  source_cell_range text,
  parser_family text,
  created_at timestamptz not null default now()
);

create index if not exists idx_analytics_reports_client_period on analytics_reports(client_id, period_end desc);
create index if not exists idx_analytics_reports_status on analytics_reports(status);
create index if not exists idx_analytics_report_lines_report on analytics_report_lines(analytics_report_id, line_index);
create index if not exists idx_analytics_report_lines_dimensions on analytics_report_lines(canonical_studio, platform, territory, product_type);
create index if not exists idx_analytics_report_lines_period on analytics_report_lines(period_end);
create index if not exists idx_analytics_report_lines_net_amount on analytics_report_lines(net_amount);
create index if not exists idx_analytics_raw_tables_report on analytics_raw_tables(analytics_report_id);
create index if not exists idx_analytics_field_provenance_report on analytics_field_provenance(analytics_report_id);

create or replace function analytics_touch_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_analytics_clients_touch_updated_at on analytics_clients;
create trigger trg_analytics_clients_touch_updated_at
before update on analytics_clients
for each row execute function analytics_touch_updated_at();

drop trigger if exists trg_analytics_reports_touch_updated_at on analytics_reports;
create trigger trg_analytics_reports_touch_updated_at
before update on analytics_reports
for each row execute function analytics_touch_updated_at();

drop trigger if exists trg_analytics_report_totals_touch_updated_at on analytics_report_totals;
create trigger trg_analytics_report_totals_touch_updated_at
before update on analytics_report_totals
for each row execute function analytics_touch_updated_at();

insert into analytics_clients (client_key, display_name, parser_family, vertical, currency, enabled)
values
  ('1979_media', '1979 Media / Dorcel', 'xlsx_1979_dorcel', 'Licensing', 'EUR', true),
  ('aerona', 'AERONA / ADE', 'xlsx_aerona_rollup', 'VOD', 'USD', true),
  ('amg', 'All Media Group / AMG', 'xlsx_amg_mixed', 'Licensing', 'USD', true),
  ('av_entertainment', 'AV Entertainment / Optical Xtreme', 'xlsx_av_royalty_header', 'VOD', 'USD', true),
  ('bell_canada', 'Bell Canada', 'xlsx_bell_canada_payment', 'Licensing', null, true),
  ('dream_logistics', 'Dream Logistics BV', 'pdf_invoice_lines', 'VOD', 'USD', true),
  ('dusk', 'Dusk TV / 2GrapesMedia', 'xlsx_dusk_playlist', 'Licensing', 'EUR', true),
  ('erigo', 'Erigo / Load', 'pdf_payment_narrative', 'DVD', 'USD', true),
  ('erika_lust', 'Erika Lust / Lust Productions', 'xlsx_erika_summary', 'Licensing', 'EUR', true),
  ('gamma_licensing', 'Gamma Broadcast Group Licensing', 'xlsx_gamma_running_balance', 'Licensing', 'USD', true),
  ('gamma_adult_time', 'Gamma AdultTime', 'pdf_adulttime_scene', 'VOD', 'USD', true),
  ('girlfriends_films', 'Girlfriends Films', 'xlsx_girlfriends_quickbooks', 'DVD', 'USD', true),
  ('hpg_canal', 'HPG Canal / Orange', 'xlsx_hpg_canal', 'Licensing', 'EUR', true),
  ('hpg_netgem', 'HPG Netgem', 'xlsx_hpg_netgem', 'Licensing', 'EUR', true),
  ('hpg_proximus', 'HPG Proximus', 'xlsx_hpg_proximus', 'Licensing', 'EUR', true),
  ('knpb', 'KNPB Media / DVD Erotik', 'xlsx_knpb_credit_note', 'VOD', 'EUR', true),
  ('level5', 'Level5 Media / Veegaz', 'pdf_level5_credit_note', 'VOD', 'EUR', true),
  ('new_sensations', 'New Sensations', 'xlsx_new_sensations_paid', 'DVD', 'USD', true),
  ('omnet', 'OMNet / Orgazmik', 'xlsx_embedded_image_omnet', 'VOD', 'EUR', true),
  ('pulse', 'Pulse Distribution', 'xlsx_pulse_cumulative_balance', 'DVD', 'USD', true),
  ('sonifi', 'Sonifi Solutions', 'docx_sonifi_statement', 'VOD', 'USD', true),
  ('velvet_media', 'Velvet Media', 'xlsx_velvet_rfi_specs', 'Licensing', 'EUR', true),
  ('aebn', 'WMM Holdings / AEBN', 'xlsx_aebn_title', 'VOD', 'USD', true)
on conflict (client_key) do update set
  display_name = excluded.display_name,
  parser_family = excluded.parser_family,
  vertical = excluded.vertical,
  currency = excluded.currency,
  enabled = excluded.enabled,
  updated_at = now();

create or replace view analytics_dashboard_summary with (security_invoker = on) as
select
  count(*)::integer as reports_count,
  coalesce(sum(line_count), 0)::integer as line_count,
  count(*) filter (where status = 'ready')::integer as ready_reports,
  count(*) filter (where status in ('review', 'blocked', 'failed'))::integer as attention_reports,
  coalesce(sum(coalesce(line_items_total, postings_total, source_total, 0)), 0)::numeric(18, 2) as total_amount,
  count(distinct client_id)::integer as active_clients
from (
  select
    ar.*,
    (select count(*) from analytics_report_lines arl where arl.analytics_report_id = ar.id) as line_count
  from analytics_reports ar
) x;

create or replace view analytics_client_summary with (security_invoker = on) as
select
  ac.id as client_id,
  ac.client_key,
  ac.display_name,
  ac.parser_family,
  ac.vertical,
  ac.currency,
  count(ar.id)::integer as reports_count,
  coalesce(sum((select count(*) from analytics_report_lines arl where arl.analytics_report_id = ar.id)), 0)::integer as line_count,
  coalesce(sum(coalesce(ar.line_items_total, ar.postings_total, ar.source_total, 0)), 0)::numeric(18, 2) as total_amount,
  max(ar.created_at) as last_report_at
from analytics_clients ac
left join analytics_reports ar on ar.client_id = ac.id
where ac.enabled = true
group by ac.id, ac.client_key, ac.display_name, ac.parser_family, ac.vertical, ac.currency;

alter table analytics_clients enable row level security;
alter table analytics_source_files enable row level security;
alter table analytics_reports enable row level security;
alter table analytics_raw_tables enable row level security;
alter table analytics_report_lines enable row level security;
alter table analytics_report_totals enable row level security;
alter table analytics_field_provenance enable row level security;
