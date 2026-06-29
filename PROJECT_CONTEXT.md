# Accounting Parser Project Context

## Purpose

This document is the source-of-truth context for the NMG accounting report parsing project.

The v1 goal is to convert client-provided accounting reports into the same unified row shape currently entered into the Airtable-style `Data Entry` sheet. v1 is not a QuickBooks automation project. QuickBooks matters only because the Airtable rows were designed to feed that later process.

The likely later integration point is the existing Laravel database application at `/home/moez/clients/nmg/ai/repos/db`, which already contains studio, parent studio, royalty report, and QuickBooks-related concepts. This context stays implementation-neutral so the parser can first be specified and validated against the accounting files.

## Local Source Inventory

Primary project folder:

`/home/moez/clients/nmg/accounting`

Important files:

- `meeting.md`: raw meeting transcript and notes.
- `meeting-recap.md`: cleaner meeting recap and decision summary.
- `Accounting Project-20260622T175655Z-3-001/Accounting Project/Copy of NMG Airtable Data Entry - This is where you will find processed through Airtable  data.xlsx`: target output reference.
- `Accounting Project-20260622T175655Z-3-001/Accounting Project/Reporting Access and Mapping.xlsx`: report access notes and client/report mapping.
- `Accounting Project-20260622T175655Z-3-001/Accounting Project/Studio and parent company list.csv`: database-exported studio metadata.
- `Accounting Project-20260622T175655Z-3-001/Accounting Project/Sample Reports/`: source report examples. Samples include `.xlsx`, `.pdf`, `.png`, and `.docx`.

Reference workbook structure:

- `Copy of NMG Airtable Data Entry...xlsx`
  - `Data Entry`: target row format.
  - `Studio Lookup`: canonical v1 studio output names.
  - `Customer Lookup`: customer lookup data.
  - `Vertical Lookup`: vertical lookup data.
- `Reporting Access and Mapping.xlsx`
  - `Overview`: client, vertical, report access, and notes.
  - `Report Maping`: human-oriented report mapping notes.
  - `Report Mapping (Dev)`: compact developer mapping table.

## V1 Output Contract

The final export must produce Airtable-compatible rows with these columns:

- `Customer`
- `Studio`
- `Amount`
- `Memo`
- `Invoice Date`
- `Due Date`
- `Vertical`
- `Date Entered`
- `Date Added to Airtable`
- `Antoinette or Val Invoice#`

Output field rules:

- `Customer` must use the customer name style found in the Airtable `Data Entry` sheet, not blindly the folder name.
- `Studio` must use the canonical output label style from `Studio Lookup`, usually `Parent Studio` or `Parent Studio:Brand`.
- `Amount` must be a numeric value, not a preformatted currency string.
- `Memo` should describe the vertical and reporting period, matching existing examples such as `VOD April 2026`, `DVD April 2026`, or `Various titles Q1 2026`.
- `Invoice Date` should be the reporting period end date unless a source-specific rule says otherwise.
- `Due Date` should default to two months after invoice date unless a source-specific rule says otherwise.
- `Vertical` must match the known Airtable vertical naming, such as `VOD`, `DVD`, or `Licensing`.
- `Date Entered`, `Date Added to Airtable`, and invoice number fields can remain blank for generated parser output unless the import workflow explicitly supplies them.

## Internal Audit Contract

Every generated Airtable row should have an internal/audit parse record. This audit record is required because many reports are grouped from title or brand rows into studio totals, and humans still need to verify exceptions.

Audit fields:

- `source_file`
- `parser_family`
- `source_sheet`
- `source_page`
- `source_row`
- `raw_title`
- `raw_brand`
- `canonical_studio`
- `customer`
- `period`
- `amount`
- `currency`
- `aggregation_notes`
- `validation_warnings`

The final Airtable export may omit audit fields, but parser tests and review output must retain them.

## Brand And Company Mapping

Yes, the brand/company mapping has been checked at the project-context level.

Findings:

- Airtable `Studio Lookup` is the best canonical v1 source for output labels because it already matches the `Data Entry` `Studio` values.
- `Studio Lookup` has full parent-company labels and output names like `AMA Multimedia LLC:Pure Passion`, `Paper Street Media LLC:Team Skeet`, and `SARJ LLC:MetArt`.
- `Studio and parent company list.csv` has useful database metadata, including `name`, `permalink`, `percent`, `type`, and `parent`.
- The CSV `parent` field often contains abbreviations such as `AE`, `BAE`, `FH`, `CAR`, `PP`, or `DOR`, not the full payout/company label needed for Airtable output.
- The CSV should be treated as supplemental metadata for percentages, studio type, and reconciliation, not as the direct output-name source.
- Source report brand names must be normalized to canonical Airtable studio labels before aggregation.
- Unknown brands, ambiguous parent codes, and brands missing from `Studio Lookup` must be flagged for review instead of guessed silently.

Examples observed while checking mappings:

- Dream Logistics PDF source row `Charged` maps to Airtable output studio `Charged Media LLC`.
- Dream Logistics source row `AMA` maps to `AMA Multimedia LLC`.
- Dream Logistics source row `Boyfun` maps to `EENT Inc.`.
- Dream Logistics source row `Carnal` maps to `Carnal Media LLC`.
- KNPB and AEBN-style reports contain brand/title rows that must roll up into Airtable studio labels, sometimes combining multiple brands under one parent payout row.

## Core Parsing Rules

- Prefer workbook data over PDF when the same report is available in both formats.
- Do not convert currencies in v1. Preserve the reported numeric amount and store the detected currency in audit data.
- Aggregate source brand/title rows into Airtable studio rows using canonical mapping.
- Use the Airtable workbook `Studio Lookup` sheet as the v1 canonical output-name source.
- Use `Studio and parent company list.csv` as supplemental metadata for percentages, studio type, and parent-code reconciliation.
- Flag unknown brands, blank amounts, mismatched totals, and changed report layouts for human review.
- Detect report layout changes by validating expected sheets, headers, subtotal labels, and required amount columns per parser family.
- Keep source row/page references wherever possible so a reviewer can trace each output row back to the original report.
- Do not assume exact row-level matches between source reports and Airtable output. Reports often contain title or brand rows that must be summed into one studio or parent-company row.

## Parser Strategy

Use deterministic, source-specific parsers for stable known report families. The meeting notes indicate report layouts rarely change, so code-based parsing plus layout validation is the primary path.

Use AI or OCR-style assistance only for blocked, semi-structured, or non-table cases where deterministic extraction is not practical. AI output must still be validated against the same output and audit contracts.

## V1 Parser Candidates

These sample-backed families are v1 candidates:

- `1979 Media (Dorcel)`
- `AERONA LLC` / ADE
- `All Media Group (AMG)`
- `AV Entertainment/Optical Xtreme`
- `Dream Logistics BV`
- `Dusk TV/2GrapesMedia B.V.`
- `ERIGO` / Erigo-Load
- `Erika Lust S.L.U.` / Lust Productions
- `Gamma Broadcast Group Inc.` licensing
- `Gamma Broadcast Group Inc.:Adult Time`
- `Girlfriends Films`
- `HPG Production`
- `KNPB Media BV (DVDErotik)` / DVD Erotik
- `Level5 Media GmbH (Veegaz)`
- `New Sensations Inc.`
- `OMNet AG (Orgazmik)`
- `Pulse Distribution`
- `WMM Holdings LLC (AEBN)`

## Known Deferred Or Blocked Cases

- `Sonifi Solutions`: blocked pending a business decision and a proper source ingestion method. The local folder has a statement `.docx` and a constructed royalties workbook, but the mapping notes say the processing method is not finalized.
- `Traffic Rug LLC`: blocked because the payment meaning is unclear and there is no report.
- `Tago Media S.L. (EroticOnly)`: new client with no established report format.
- `Velvet Media B.V.`: blocked pending the correct `2603019 RFI New Media Group - SPECS` sample. The local sample currently appears to be an AEBN-style `Studio Statistics - Payout by Title` workbook, which conflicts with the mapping workbook and Airtable examples for Velvet.

## Validation And Test Plan

For each v1 parser family:

- Compare parser output against matching historical Airtable `Data Entry` rows when available.
- Validate grouped totals against source totals, highlighted totals, or subtotal sections.
- Validate that unknown brands are surfaced as warnings, not silently dropped.
- Validate changed-header or changed-layout detection.
- Confirm generated Airtable rows use typed numeric amounts and typed dates.
- Confirm downstream fields that belong to manual/Airtable/QuickBooks processing remain blank unless explicitly provided.

PDF-only or PDF-relevant extraction tests:

- `Dream Logistics BV`: extract invoice line items from the PDF.
- `Erigo-Load`: extract payment sections and final USD totals from the email-style PDF.
- `Gamma Broadcast Group Inc.:Adult Time`: extract Tableau table totals and combine the two report totals when required.
- `KNPB Media BV (DVDErotik)`: extract credit-note summary and studio breakdown when workbook data is not preferred or available.
- `Level5 Media GmbH (Veegaz)`: extract `Studio total` rows from the credit-note PDF.

Workbook-specific tests:

- Confirm each parser finds the intended sheet/tab by name or structure.
- Confirm each parser validates expected headers before using numeric columns.
- For multi-sheet reports, confirm only the intended booking sheet or subtotal is used.
- For reports with prepaid expenses or deductions, confirm those amounts are represented according to source-specific rules and reflected in audit notes.

## Current Data Observations

- The Airtable `Data Entry` sheet contains historical processed rows across dozens of customers and can be used for regression examples.
- The Airtable `Studio Lookup` sheet contains canonical full studio labels and parent studio names; it is more directly aligned with output rows than the CSV alone.
- The studio CSV contains useful brand metadata, percentages, type values, and parent abbreviations, but parent abbreviations are not always full output names.
- Some current-month Airtable rows may have blank amounts, so tests should prefer completed historical rows when asserting expected amounts.
- Folder names, mapping names, and Airtable customer names are not always identical. Implementers must include customer normalization.

## Out Of Scope For V1

- QuickBooks upload/import automation.
- Database-generated invoice fixes.
- Invoice note or banking information propagation.
- Bulk bill generation.
- Live Airtable API writes.
- Currency conversion.
- Replacing accounting review entirely. Human review remains required for warnings, new formats, and blocked clients.

## Acceptance Criteria

The project context is complete when an implementer can:

- Identify the source files and reference workbooks.
- Understand the target Airtable row shape.
- Understand why audit metadata is required.
- Know which parser families are in v1 and which are blocked.
- Know which mapping source is canonical for output labels.
- Know the validation expectations before writing parser code.

