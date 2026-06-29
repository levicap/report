-- Optional cleanup for package/audit files that were accidentally uploaded as reports.
-- Run this after deploying the classifier guard if your dashboard shows package files as reports.

delete from reports
where id in (
  select rsf.report_id
  from report_source_files rsf
  join source_files sf on sf.id = rsf.source_file_id
  where lower(sf.original_file_name) in (
    'accounting_normalization_audit.md',
    'accounting_report.schema.json',
    'aerona_raw_rollup_reconciliation.csv',
    'anomaly_register.csv',
    'customer_lookup.csv',
    'field_mapping_matrix.csv',
    'file_manifest.csv',
    'hpg_file_audit.csv',
    'new_sensations_file_audit.csv',
    'pulse_file_audit.csv',
    'readme.md',
    'report_group_audit.csv',
    'sample_normalized_reports.json',
    'schema_validation_results.csv',
    'studio_lookup.csv',
    'target_field_gap_analysis.csv',
    'vendor_mapping_config.json',
    'vertical_lookup.csv'
  )
);

update source_files
set
  status = 'ignored',
  platform_id = null,
  parser_profile_id = null,
  failure_message = null,
  source_metadata = source_metadata || jsonb_build_object(
    'ignored_reason',
    'This file is part of the audit/config package, not a platform source report.'
  )
where lower(original_file_name) in (
  'accounting_normalization_audit.md',
  'accounting_report.schema.json',
  'aerona_raw_rollup_reconciliation.csv',
  'anomaly_register.csv',
  'customer_lookup.csv',
  'field_mapping_matrix.csv',
  'file_manifest.csv',
  'hpg_file_audit.csv',
  'new_sensations_file_audit.csv',
  'pulse_file_audit.csv',
  'readme.md',
  'report_group_audit.csv',
  'sample_normalized_reports.json',
  'schema_validation_results.csv',
  'studio_lookup.csv',
  'target_field_gap_analysis.csv',
  'vendor_mapping_config.json',
  'vertical_lookup.csv'
);
