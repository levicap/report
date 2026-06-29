-- Backfill platform/profile references for reports processed before
-- platform and parser profile seed data were applied.

with profile_match as (
  select distinct on (parser_family)
    id as parser_profile_id,
    platform_id,
    parser_family
  from parser_profiles
  where enabled = true
  order by parser_family, created_at desc
)
update reports r
set
  parser_profile_id = coalesce(r.parser_profile_id, pm.parser_profile_id),
  platform_id = coalesce(r.platform_id, pm.platform_id)
from profile_match pm
where r.parser_family = pm.parser_family
  and (r.parser_profile_id is null or r.platform_id is null);

update source_files sf
set
  parser_profile_id = coalesce(sf.parser_profile_id, r.parser_profile_id),
  platform_id = coalesce(sf.platform_id, r.platform_id)
from report_source_files rsf
join reports r on r.id = rsf.report_id
where sf.id = rsf.source_file_id
  and (sf.parser_profile_id is null or sf.platform_id is null);
