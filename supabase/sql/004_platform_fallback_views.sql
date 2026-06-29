-- Refresh reconciliation view so reports processed before platform seed data
-- still display their reporting party from normalized JSON.

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
