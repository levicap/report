# Parser/Airtable Findings

Generated after running `npm run compare:airtable` against all manifest-listed sample reports and the NMG Airtable `Data Entry` sheet.

## What The Comparison Means

- `exact_row_match`: parser output matches Airtable by customer, studio, amount, memo period, invoice/due date context, and vertical.
- `context_amount_match`: amount exists for the same customer/period, but studio or memo differs. This is useful evidence, not a final approval.
- `customer_period_present_amount_missing`: Airtable has rows for that customer/period, but not the parser amount. Usually this means the parser is outputting the wrong row shape or calculation level.
- `missing_in_airtable`: no strong customer/period/amount match was found.
- `weak_amount_only_match`: the amount appears somewhere in Airtable history, but not with enough customer/period context to count.
- `review_not_exportable`, `blocked_not_exportable`, `suppressed_not_exportable`, and `not_expected_to_export` should not export automatically.

## Overall Result

- 220 sample files were parsed/classified.
- 258 parser postings were compared to Airtable.
- 126 postings matched Airtable exactly.
- 0 postings matched only by customer/period amount context.
- 0 postings had the right customer/period available in Airtable, but the parser amount did not match.
- 9 postings had no strong Airtable match.
- 21 postings had only weak amount-history matches.
- 100 postings are review-gated and not exportable.
- 91 sample files were supporting or verification files and are correctly not expected to export.
- Bundle preview adds 41 cross-file candidate rows: 40 HPG rows and 1 AdultTime row. All 41 match NMG Airtable exactly, but these are not yet part of the normal Supabase export view.

## Parser Families That Currently Match Best

- `pdf_invoice_lines` / Dream Logistics: exact match for all 4 Q1 2026 studio invoice rows.
- `xlsx_dusk_playlist` / Dusk: exact match for both April 2026 studio rows.
- `xlsx_erika_summary` / Erika Lust: exact match for all 7 Q1 2026 producer/studio rows.
- `xlsx_gamma_running_balance` / Gamma licensing: exact match for the January 2026 EENT row.
- `xlsx_pulse_cumulative_balance` / Pulse Distribution: exact match for 19 positive April 2026 DVD rows after applying deterministic filename-to-studio/memo mapping.
- `xlsx_aebn_title` / WMM Holdings AEBN: 28 ready studio-level rows match Airtable exactly; 3 unresolved allocations stay review-only.
- `xlsx_1979_dorcel` / Dorcel: 8 studio-level Q1 2026 rows match Airtable exactly.
- `xlsx_knpb_credit_note` / KNPB: 29 studio-level April 2026 rows match Airtable exactly.

## Parser Families Correctly Held Back

- `xlsx_amg_mixed`: review gate is correct because highlighted/manual rows need manual treatment.
- `pdf_payment_narrative`: Erigo is review-only because the source has a currency-label issue.
- `xlsx_embedded_image_omnet`: review-only because the usable source data is embedded image content.
- `docx_sonifi_statement`: blocked because the business allocation rule/source method is not approved.
- `xlsx_pulse_cumulative_balance`: one negative NVG payable is correctly suppressed.
- Verification/supporting files such as HPG PDFs, Dusk PDFs, AERONA raw platform files, and AEBN PNG are correctly not expected to export.

## Parser Families That Still Need Output Or Business Changes

- `xlsx_aerona_rollup`: 28 source-backed studio rows match Airtable. Four residual splits are review-only because the source report does not define the BAEB, Carnal Network, JayRock, or TrueX Airtable allocation split.
- `pdf_adulttime_scene`: parser identifies the two PDF totals, 556.16 and 403.35, and the bundle preview matches Airtable's single April 2026 row for 959.51. The individual PDF parsers stay review-only until scene-level `Revshare` rows are persisted and validated.
- `xlsx_hpg_canal`, `xlsx_hpg_netgem`, `xlsx_hpg_proximus`: parser reads the correct amount columns and studio labels. The bundle preview matches all 40 NMG Airtable rows exactly: January/February by month+studio across channels, and March split into Canal vs Netgem+Proximus batches. Production export still needs a bundle creation step because the current export view is single-report based.
- `xlsx_aebn_title`: parser now splits the source workbook to studio-level postings. Raw Attack, Holly Randall, and the BAEB `All Natural` residual remain review-only because changing those amounts to Airtable would require an allocation policy not present in the source file.
- `xlsx_new_sensations_paid`: parser emits studio-level April 2026 DVD rows and handles expenses correctly. The NMG Airtable workbook does not contain April 2026 New Sensations rows, so comparison remains missing by context.
- `xlsx_av_royalty_header`: parser emits studio-level April 2026 VOD rows that reconcile to the 907.45 USD header total. The NMG Airtable workbook does not contain April 2026 AV rows, so comparison remains weak/missing by context.
- `xlsx_girlfriends_quickbooks`: parser emits separate April and May 2026 SARJ LLC rows using one sheet-level total per month and 65 percent share. The NMG Airtable workbook does not contain those months for Girlfriends.
- `pdf_level5_credit_note`: parser emits three studio-level rows from the local 2026 credit note. NMG Airtable has older monthly SARJ aggregate rows but not this March-May 2026 credit-note split.

## Artifacts

- Detailed posting comparison: `docs/parser_output_to_airtable_comparison.csv`
- Per-file rollup: `docs/parser_file_to_airtable_summary.csv`
- Markdown comparison summary: `docs/parser_output_to_airtable_comparison.md`
- Cross-file bundle preview: `docs/bundle_preview.md` and `docs/bundle_preview.csv`
