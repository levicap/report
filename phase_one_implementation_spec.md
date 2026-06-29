# Accounting Normalization Phase One Implementation Spec

## Inputs Reviewed

- `accounting_normalization_audit.md`
- `accounting_normalization_package/accounting_report.schema.json`
- `accounting_normalization_package/sample_normalized_reports.json`
- `accounting_normalization_package/vendor_mapping_config.json`
- `accounting_normalization_package/file_manifest.csv`
- `accounting_normalization_package/report_group_audit.csv`
- `accounting_normalization_package/field_mapping_matrix.csv`
- `accounting_normalization_package/target_field_gap_analysis.csv`
- `accounting_normalization_package/anomaly_register.csv`

The audit package contains the normalized JSON contract, worked examples, parser family policy, file hashes, known anomalies, and the old Airtable field gap analysis. The original binary platform reports are represented by the manifest but are not present in this workspace.

## Phase One Boundary

Phase one replaces manual report reading and Airtable entry with a controlled ingestion, normalization, validation, review, and Airtable export pipeline.

Included:

- Manual report upload and shared-folder ingestion.
- Immutable storage of original source files.
- SHA-256 hashing and duplicate detection even when files are renamed.
- Platform and format detection.
- Parser profile selection through a registry.
- Deterministic extraction for known formats.
- Canonical JSON generation using `accounting_report.schema.json`.
- PostgreSQL storage as the authoritative normalized data store.
- Validation of required fields, reporting periods, currencies, totals, and accounting rules.
- Human review for unknown, invalid, or uncertain records.
- Airtable-compatible export generation or Airtable API submission.
- Admin reconciliation reporting across received, processed, duplicate, failed, review, source total, normalized total, and export total stages.

Excluded:

- Automatic downloading from all platforms.
- QuickBooks payment processing or applying customer payments.
- A complete sales reporting portal.
- Profitability reports combining revenue and expenses.
- Replacing Airtable.
- Building a full ERP.

## System Of Record

PostgreSQL is the system of record. Airtable receives generated output, but it must not be the normalized accounting database.

The canonical JSON contract in `accounting_report.schema.json` remains the external normalized report model. PostgreSQL stores:

- Immutable file metadata and content-addressed original file locations.
- Report classification and parser version snapshots.
- Normalized report JSON.
- Record-level normalized JSON for line items, allocations, and postings.
- Field-level provenance for every normalized value.
- Validation results and reconciliation totals.
- Review decisions and correction overlays.
- Export payloads, destination IDs, and export totals.

The old ten-column Airtable structure should be treated as an export view over `accounting_postings`, not as the internal schema.

## Workflow

1. A user uploads a file or places it in a watched shared folder.
2. The ingestion service stores the original bytes in immutable object storage before parsing.
3. The service computes SHA-256 from the bytes.
4. The service registers the received file in PostgreSQL and checks whether the hash already exists.
5. Exact duplicates are marked duplicate and linked to the first received file. They are not parsed unless explicitly reprocessed by an admin.
6. Non-duplicates are classified by filename, extension, media type, source text, workbook structure, visible headers, and known hash or folder evidence from the manifest.
7. The parser registry selects the best enabled parser profile.
8. Shared readers extract raw tables, cells, text blocks, pages, embedded images, and document metadata.
9. The selected parser profile maps source fields into the canonical JSON model.
10. The system validates the JSON schema.
11. The system validates accounting rules with decimal arithmetic.
12. If validation passes and no review gate is required, records are stored as ready.
13. If validation fails or confidence is insufficient, review items are created and no posting is approved.
14. A reviewer corrects extracted values or approves explicit exceptions without changing the original file.
15. Approved records are exported to Airtable format or sent through the Airtable API.
16. Completion is blocked until source, normalized, and export totals reconcile within the configured tolerance.

## Parser Strategy

Use shared readers for file mechanics:

- Excel: workbook metadata, worksheets, cells, formulas, displayed values, merged ranges, fills/highlights, tables, embedded images.
- CSV: delimiter detection, encoding detection, header matching, typed rows.
- PDF: text extraction, table extraction, page coordinates, image fallback.
- Word: paragraphs, tables, statement blocks, document properties.
- Image: OCR and AI-assisted extraction only behind a review gate.

Use configuration-based parser profiles for normal tabular reports:

- Header aliases.
- Required columns.
- Start and stop row rules.
- Section total rules.
- Period and currency locators.
- Money field parsing.
- Static posting policy.
- Tolerance and rounding policy.
- Source-location requirements.

Use custom parser code only for unusual layouts:

- Embedded images in workbooks, such as OMNet.
- Highlight-dependent logic, such as AMG.
- Cumulative running balances, such as Pulse and Gamma Licensing.
- Workbooks with formulas, merged cells, or dynamic final columns.
- Narrative documents and image-only reports.
- Special allocation logic, such as Sonifi after policy approval.

Use AI extraction only as fallback:

- AI may classify unknown documents, propose table boundaries, or extract candidate values from image/narrative documents.
- AI output must be labeled as candidate extraction.
- AI output must go through deterministic validation.
- AI must never silently decide accounting values.
- Known formats must use deterministic parser profiles and versioned code/config.

## Parser Registry

Each parser profile should be versioned and immutable after use. A profile contains:

- `profile_key`
- `platform_id`
- `parser_family`
- `version`
- `config_version`
- `profile_type`: `config`, `custom`, `hybrid`, or `ai_fallback`
- `media_types`
- `fingerprints`: filename patterns, sheet names, headers, text snippets, and optional known hash evidence.
- `field_mappings`
- `validation_rules`
- `posting_policy`
- `rounding_policy`
- `reconciliation_tolerance`
- `review_gates`
- `enabled`

Reports and records store the parser profile id, parser family, parser version, and config version used at processing time. Reprocessing later uses a new run and never rewrites the parser version on historical records.

## Initial Parser Priority

Build deterministic structured parsers first:

- AERONA: `xlsx_aerona_rollup`
- HPG: `xlsx_hpg_channel`
- KNPB: `xlsx_knpb_credit_note`
- New Sensations: `xlsx_new_sensations_paid`
- Pulse: `xlsx_pulse_cumulative_balance`
- AV Entertainment: `xlsx_av_royalty_header`
- Dusk: `xlsx_dusk_playlist`
- AEBN: `xlsx_aebn_title`

Then add:

- 1979 Media: `xlsx_1979_dorcel`
- Erika Lust: `xlsx_erika_summary`
- Gamma Licensing: `xlsx_gamma_running_balance`
- Girlfriends Films: `xlsx_girlfriends_quickbooks`
- AMG: `xlsx_amg_mixed`

Then add document and image review-gated parsers:

- Dream Logistics: `pdf_invoice_lines`
- Gamma Adult Time: `pdf_adulttime_scene`
- Level5: `pdf_level5_credit_note`
- Erigo: `pdf_payment_narrative`
- OMNet: `xlsx_embedded_image_omnet`
- Sonifi source statements: `docx_sonifi_statement`

Keep blocked until source or policy gaps are resolved:

- Velvet: supplied files are AEBN duplicates.
- Sonifi allocation: workbook formula/policy unresolved.
- Traffic Rug: no source files supplied.
- Tago: report definition missing.

## PostgreSQL Entities

Required core entities:

- `source_files`: each received upload or shared-folder file.
- `reports`: one normalized accounting report or report bundle.
- `report_records`: normalized line items, allocations, summaries, and postings.
- `platforms`: canonical source platforms/vendors.
- `parser_profiles`: versioned parser/profile definitions.
- `validation_results`: schema, extraction, accounting, and reconciliation checks.
- `review_items`: human review queue and correction decisions.
- `processing_runs`: every ingestion, classification, parsing, validation, review, and export attempt.
- `field_provenance`: source location for every normalized field.
- `exports`: generated or transmitted Airtable payloads.

Additional supporting entities:

- `source_file_blobs`: content-addressed immutable original file bytes.
- `report_source_files`: many-to-many report bundle membership.
- `reconciliation_snapshots`: stage totals used by the admin utility and completion gate.

The accompanying DDL draft is in `postgres_phase_one_schema.sql`.

## Provenance Requirement

Every normalized value must retain its source location. For table-like data, store file, sheet, row, column, and cell range. For PDFs, store file, page, and coordinate/cell locator when available. For image or OCR extraction, store file, page or embedded image name, and confidence.

Example field provenance:

```json
{
  "field_path": "$.line_items[0].net_amount.amount",
  "value": "1250.75",
  "source_file": "report.xlsx",
  "source_sheet": "April Sales",
  "source_row": 24,
  "source_column": "Gross Revenue",
  "parser_family": "platform_x_sales",
  "parser_version": "1.0.0"
}
```

Corrections made during human review should create corrected normalized values and review audit records. They must not modify the original file or delete the original extracted value.

## Validation Rules

Validation has three layers:

1. Schema validation against `accounting_report.schema.json`.
2. Generic accounting validation.
3. Parser-profile-specific business validation.

Generic checks:

- Required fields are present.
- Currency is explicit and consistent.
- Missing values are `null`, never silently zero.
- Money is stored as decimal strings in JSON and as `numeric` in database totals.
- Reporting period is explicit and not inferred from memo text when a better source exists.
- Source locations exist for every normalized value.
- Studio/customer/vertical mappings preserve source text before canonical mapping.
- Declared total, computed normalized total, and export total reconcile within tolerance.
- Negative payable policy is applied where configured.
- Unknown formats cannot become ready or complete.

Source-specific checks come from `vendor_mapping_config.json` and `anomaly_register.csv`.

## Reconciliation

The admin utility must show:

- Files received.
- Files processed.
- Duplicate files.
- Failed files.
- Files awaiting review.
- Source report totals.
- Normalized totals.
- Airtable export totals.
- Difference between source and normalized totals.
- Difference between normalized and export totals.
- Failed validation count.
- Open review count.

Completion gate:

- A report cannot be marked complete if source and normalized totals do not reconcile.
- A report cannot be marked complete if an Airtable export exists but export totals do not reconcile.
- A report cannot be marked complete with failed validations.
- A report cannot be marked complete with open review items.
- A report cannot be marked complete when required totals are missing.

## Review Queue

Review items are created for:

- Unknown formats.
- Missing required fields.
- Ambiguous platform or parser profile.
- Ambiguous studio/customer/title mapping.
- Currency uncertainty.
- Total mismatch beyond tolerance.
- Parser confidence below threshold.
- AI-assisted extraction.
- Any vendor-specific review gate.

Reviewer actions:

- Approve extracted value.
- Correct normalized value.
- Assign canonical mapping.
- Suppress a posting with a reason.
- Mark a report blocked.
- Request a new source file or policy decision.

The review queue stores original extracted values, proposed corrected values, reviewer identity, approval time, and notes.

## Airtable Export

Airtable export is generated from approved `accounting_postings`, not directly from source rows.

Minimum export fields based on the current historical target:

- Customer
- Studio
- Amount
- Currency
- Memo
- Invoice Date
- Due Date
- Vertical
- Date Entered
- Date Added to Airtable
- Invoice Number

Export controls:

- Generate an idempotency key from report id, posting ids, destination table, and export version.
- Store the full payload before sending.
- Store Airtable record ids after successful API submission.
- Capture export totals and record counts.
- Block completion if export totals differ from normalized posting totals.
- Do not send blocked, review, suppressed, or failed postings.

## Verification Items From The Call

These claims must be confirmed before production launch:

- Whether a central database already exists.
- Whether accounting currently enters data directly into Airtable.
- Exact Airtable base, table, view, and field structure.
- Whether Airtable remains the accounting operating system or only receives exports.
- Current QuickBooks integration scope.
- Claimed monthly time savings.
- Sales reports Amanda requested.
- Which reports require title-level data.
- Which platforms provide studio, title, territory, product type, expenses, or licensing data.
- Who approves records when validation fails.
- Approved handling of AEBN one-cent portal difference.
- Approved Sonifi studio allocation policy.
- Correct Velvet source files.

## Acceptance Criteria Mapping

- Immutable original copy and SHA-256 hash: `source_file_blobs` plus `source_files`.
- Duplicate detection when renamed: hash-based duplicate grouping.
- Successful report produces valid normalized JSON: schema validation before ready status.
- Every field traceable to source: `field_provenance` required by validation.
- Unknown formats enter review: classifier creates review item and blocks ready status.
- Totals reconcile before approval: validation and reconciliation snapshots.
- Parser version retained: reports and records store parser family/version/config version.
- Standard Excel/CSV format mostly through configuration: parser profile registry and shared readers.
- Airtable-compatible output: `exports` payload and `airtable_export_ready` view.
- Accounting can correct extraction errors without changing original: review correction overlay and immutable blob storage.

## Build Order

1. Database schema, migrations, and admin reconciliation views.
2. File ingestion service with object storage, hash calculation, duplicate detection, and source file records.
3. Parser registry and file classifier.
4. Shared Excel and CSV readers.
5. JSON schema validation and generic accounting validation.
6. Review queue API and correction model.
7. AERONA parser as the first end-to-end deterministic workbook parser.
8. Airtable export generator for approved postings.
9. Admin dashboard over file status and reconciliation views.
10. Additional structured parsers in priority order.
11. PDF, Word, image, and AI-assisted review-gated extraction.

