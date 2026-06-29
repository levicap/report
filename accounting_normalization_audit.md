# Accounting report normalization audit

## 1. Scope

I reviewed all 247 supplied files, including the glossary CSV. There are 226 files after excluding Mac metadata. The source set contains 131 xlsx files, 90 PDF files, 3 PNG images, 1 Word file, and 1 CSV file.

The file by file result is in `file_manifest.csv`. The report bundle result is in `report_group_audit.csv`. HPG, Pulse, and New Sensations also have dedicated file audits because those families contain many separate workbooks.

## 2. Decision

This process can be automated, but not with one generic prompt and not by copying the current ten column Airtable table. The correct design is a parser registry with one parser family per source format. AI can classify files and assist with image or narrative extraction. Deterministic code must calculate money, map entities, reconcile totals, enforce posting policy, and stop failed records.

The canonical JSON must be the system record. Airtable or QuickBooks rows should be generated from `accounting_postings` as an export view.

## 3. Source precedence

1. Actual source file.

2. Historical processed postings and lookup tables.

3. Reporting Access and Mapping workbook.

4. Sales Report Column Glossary CSV.

The glossary is useful, but it is not reliable enough to drive execution. It says Level5 has no report, while the supplied folder includes a detailed 2026 credit note. It also treats Erigo as manual only even though its text can be extracted with a review gate.

## 4. Files that matter most

1. `Reporting Access and Mapping.xlsx`, business instructions and blocked account notes. Keep it, but apply the corrections in this audit.

2. `Copy of NMG Airtable Data Entry...xlsx`, historical posting behavior plus customer, studio, and vertical lookups. This is the strongest test oracle for old accounting behavior.

3. `Sales_Report_Column_Glossary - Column Glossary(1).csv`, supporting terminology only.

4. Every source file marked `primary_source` in `file_manifest.csv`.

5. Paired PDFs and screenshots marked as verification. They should not replace the more exact xlsx source.

6. Sonifi source DOCX. It is parseable now. The Sonifi allocation xlsx is not approved for automated posting.

## 5. Main exceptions

1. Velvet is blocked. Both supplied Velvet files are exact AEBN duplicates. The expected Velvet workbook and PDF are absent.

2. Sonifi source extraction is ready, but allocation is blocked. Cell P24 in the internal model uses O11 instead of O24, and the studio payment policy is unresolved.

3. Pulse must use the final cumulative Summary balance. Nineteen positive April balances match historical postings. The negative NVG balance was not posted and should remain a carryforward.

4. AERONA must use the rollup. The four raw platform files omit Unlimited revenue.

5. Erika Lust must use the producer summary. The detail table omits Viv Thomas income of 143.516114333329 EUR.

6. AMG must separate highlighted flat fee rows from revenue share rows.

7. OMNet xlsx files are image containers. A normal cell parser will return no usable report data.

8. AEBN has a one cent difference between line totals and the portal payout. Its displayed component columns also exceed line Total by 0.46 USD because of source rounding.

## 6. Canonical JSON design

The JSON separates source facts, allocation decisions, and final accounting postings.

`source` stores the reporting party, statement reference, source file hashes, file roles, and locators.

`period` stores explicit dates separately from memo text.

`financial_summary` stores gross sales, period royalties, prior balance, collections, fees, expenses, payments, reserves, adjustments, and net payable as separate money objects.

`line_items` stores title, studio, quantity, channel, territory, gross amount, share rate, fees, net amount, raw fields, and exact source location.

`allocations` stores direct or policy based studio allocations. This is where Sonifi package allocation belongs after approval.

`accounting_postings` stores the fields needed by Airtable or QuickBooks. Reports can create several postings, one posting, a review hold, or no posting.

`validation` stores declared total, computed total, difference, tolerance, checks, issues, and review requirement.

Money is stored as a decimal string with an explicit currency. Missing data is `null`, never zero. Source and canonical studio names are both retained.

The exact contract is in `accounting_report.schema.json`. Six worked examples are in `sample_normalized_reports.json`.

## 7. Parser and review policy

Ready for deterministic xlsx parsing: 1979 Media, AERONA, AV, Dusk, Erika Lust, Gamma Licensing, Girlfriends Films, HPG, KNPB, New Sensations, Pulse, and AEBN.

Ready with document extraction and a review gate: Dream Logistics, Erigo, Gamma Adult Time, Level5, OMNet, and Sonifi source statements.

Blocked: Velvet source, Sonifi studio allocation, Traffic Rug policy, and Tago report definition. Traffic Rug and Tago appear in the control workbook but no source files were supplied here.

## 8. Production controls

1. Hash every file before parsing. Reject exact duplicates inside different vendor folders unless explicitly approved.

2. Classify the report family before extraction. Do not choose a total by keyword alone because terms such as Total and Payout have different meanings across vendors.

3. Run deterministic calculations using decimal arithmetic.

4. Reconcile every line or section total to the source declared total.

5. Map studio aliases only after preserving the source text. Unknown or ambiguous aliases go to review.

6. Create postings only when validation passes and the vendor posting policy permits it.

7. Store the original file, normalized JSON, parser version, config version, validation result, and exported posting IDs together.

## 9. Suggested build order

1. Build the ingestion service, file hashing, parser registry, JSON validation, and review queue.

2. Implement AERONA, HPG, KNPB, New Sensations, Pulse, AV, Dusk, and AEBN first. These provide the highest volume of structured examples.

3. Add 1979 Media, Erika Lust, Gamma Licensing, Girlfriends Films, and AMG.

4. Add PDF and image parsers for Dream, Gamma Adult Time, Level5, Erigo, and OMNet.

5. Add Sonifi source parsing, then wait for an approved allocation policy before enabling postings.

6. Obtain the correct Velvet files and build its eight channel rules from the real source.

## 10. Package index

`file_manifest.csv` contains one row per supplied file.

`report_group_audit.csv` contains one row per report bundle or processing unit.

`hpg_file_audit.csv`, `pulse_file_audit.csv`, and `new_sensations_file_audit.csv` contain source specific detail.

`anomaly_register.csv` lists material risks and required rules.

`field_mapping_matrix.csv` maps source fields to JSON paths.

`target_field_gap_analysis.csv` maps the old Airtable columns and identifies missing system fields.

`studio_lookup.csv`, `customer_lookup.csv`, and `vertical_lookup.csv` are extracted from the historical workbook.

`vendor_mapping_config.json` is the executable policy draft.

`accounting_report.schema.json` is the normalized JSON contract.

`sample_normalized_reports.json` contains worked examples.

`schema_validation_results.csv` confirms whether the examples validate against the schema.
