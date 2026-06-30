create table if not exists record_comments (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references reports(id) on delete cascade,
  report_record_id uuid not null references report_records(id) on delete cascade,
  comment_text text not null check (length(trim(comment_text)) > 0),
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_record_comments_report_id on record_comments(report_id);
create index if not exists idx_record_comments_record_id on record_comments(report_record_id, created_at desc);

create or replace function touch_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_record_comments_touch_updated_at on record_comments;
create trigger trg_record_comments_touch_updated_at before update on record_comments for each row execute function touch_updated_at();

alter table record_comments enable row level security;

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
  rr.normalized_json as posting_json,
  rr.normalized_json ->> 'entered_at' as entered_at,
  rr.normalized_json ->> 'exported_at' as exported_at
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
