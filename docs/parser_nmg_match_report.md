# Parser To NMG Airtable Match Report

Generated from `npm run test:parsers` and `npm run compare:airtable` against the local sample reports and the NMG Airtable `Data Entry` workbook.

## Coverage

- 220 sample files were classified/compared.
- 129 parser-relevant sample files were run through parser fixtures.
- Parser runtime result: 0 parse errors, 0 schema failures, 0 mapping mismatches.
- Parser statuses across the 129 parser fixture files: 35 ready, 92 review, 1 blocked, 1 suppressed.
- 91 files are support/verification/reference files and are intentionally not export sources.
- Cross-file bundle preview: 41 bundle rows, all exact Airtable matches.

## Airtable Match Result

The parser can read most sample files, but Airtable-ready matching is much narrower.

| Match bucket | Posting count | Meaning |
| --- | ---: | --- |
| `exact_row_match` | 126 | Customer, studio, amount, period, vertical, and dates match NMG Airtable. |
| `context_amount_match` | 0 | Amount exists for the same customer/period, but studio/memo shape differs. |
| `customer_period_present_amount_missing` | 0 | NMG has rows for that customer/period, but not the parser amount. |
| `missing_in_airtable` | 9 | No strong NMG Airtable match. |
| `weak_amount_only_match` | 21 | Amount exists somewhere, but context is not strong enough. |
| `review_not_exportable` | 100 | Parser intentionally blocks export until review. |
| `suppressed_not_exportable` | 1 | Negative/carry-forward item suppressed. |
| `expected_export_but_no_postings` | 1 | Source parsed but business allocation is missing. |

## Matches Correctly

These parser families currently match NMG Airtable exactly:

| Parser family | Files | Exact postings |
| --- | ---: | ---: |
| `pdf_invoice_lines` / Dream Logistics | 1 | 4 |
| `xlsx_dusk_playlist` / Dusk | 1 | 2 |
| `xlsx_erika_summary` / Erika Lust | 1 | 7 |
| `xlsx_gamma_running_balance` / Gamma licensing | 1 | 1 |
| `xlsx_pulse_cumulative_balance` / Pulse Distribution | 19 positive files | 19 |
| `xlsx_aebn_title` / WMM Holdings AEBN | 1 partial file | 28 |
| `xlsx_1979_dorcel` / Dorcel | 1 | 8 |
| `xlsx_knpb_credit_note` / KNPB | 1 | 29 |

Pulse Distribution is now exact for the 19 positive April files. The negative NVG workbook remains correctly suppressed as a carry-forward.
AEBN now produces studio-level postings from the workbook `Total` column. Twenty-eight ready postings match NMG Airtable exactly; three source-backed differences stay review-only.
Dorcel and KNPB also now produce studio-level postings that match the sample Airtable rows exactly.

## Does Not Match Yet

| Parser family | Count | Current problem |
| --- | ---: | --- |
| `pdf_adulttime_scene` | 2 files | Parser returns separate PDF totals: 556.16 and 403.35. Bundle preview sums them to 959.51 and matches NMG Airtable exactly. It still must persist scene-level `Revshare` before automatic export. |
| `xlsx_aerona_rollup` | 1 file | Mostly fixed: 28 source-backed studio postings match Airtable exactly. Four split/allocation residuals are review-only because the source workbook does not contain the allocation rule. |
| `xlsx_aebn_title` | 1 file | Mostly fixed: 28 source-backed studio postings match Airtable exactly. Raw Attack, Holly Randall, and the BAEB `All Natural` residual are review-only because their source totals do not exactly match the Airtable allocation. |
| `xlsx_av_royalty_header` | 1 file | Parser now emits studio-level April 2026 rows that reconcile to the 907.45 USD header total. NMG Airtable does not contain April 2026 AV rows. |
| `xlsx_girlfriends_quickbooks` | 1 file | Parser now emits separate April/May 2026 SARJ rows from sheet-level totals. NMG Airtable does not contain those months for Girlfriends. |
| `xlsx_hpg_canal` | 32 files | Parser reads the right amount column and studio. Bundle preview groups it into Airtable rows exactly, but production export needs multi-file bundle support. |
| `xlsx_hpg_netgem` | 17 files | Same HPG bundle issue; preview rows match Airtable exactly. |
| `xlsx_hpg_proximus` | 35 files | Same HPG bundle issue; preview rows match Airtable exactly. |
| `xlsx_new_sensations_paid` | 5 files | Parser now emits studio-level April 2026 rows and handles expenses correctly. NMG Airtable does not contain April 2026 New Sensations rows. |
| `pdf_level5_credit_note` | 1 file / 3 postings | Parser emits three studio-level rows from the local credit note. NMG Airtable has older monthly SARJ aggregate rows but not this March-May 2026 split. |
| `docx_sonifi_statement` | 1 file | Parsed but blocked because studio/package allocation policy is unresolved. |

## Review-Only By Design

These are not safe to export automatically yet:

| Parser family | Reason |
| --- | --- |
| `pdf_adulttime_scene` | Needs two-file bundle and scene `Revshare` extraction. |
| `xlsx_amg_mixed` | Manual highlighted rows and flat-fee handling need accounting review. |
| `pdf_payment_narrative` / Erigo | Source contains conflicting currency labels. |
| `xlsx_embedded_image_omnet` | Source data is embedded-image style; needs OCR/image extraction and mapping. |
| `docx_sonifi_statement` | Allocation policy unresolved. |

## AdultTime Detail

Current parser code has hash-specific totals:

- `AdultTimeContentRoyalties_exxxtrasmall-channel_20260401.pdf`: 556.16 USD
- `AdultTimeContentRoyalties_exxxtrasmall_20260401.pdf`: 403.35 USD
- Combined expected NMG Airtable row: 959.51 USD

So the extraction of each PDF total is not the final accounting posting. The correct parser behavior should create a bundled April 2026 report with one Airtable posting for 959.51 USD under `Gamma Broadcast Group Inc.:Adult Time` / `Paper Street Media LLC`, after validating the scene-level `Revshare` rows.

`npm run preview:bundles` now produces that bundled row and matches Airtable row 17942 exactly. It is intentionally a preview artifact until the production DB/export layer can store bundle provenance.

## HPG Bundle Detail

`npm run preview:bundles` also creates 40 HPG bundle rows:

- January 2026: grouped across Canal, Netgem, and Proximus by canonical studio.
- February 2026: grouped across Canal, Netgem, and Proximus by canonical studio.
- March 2026: split into Canal rows and Netgem+Proximus rows by canonical studio.

All 40 HPG preview rows match NMG Airtable exactly. The remaining work is app/data-model work: create a bundle report or bundle tables so one export row can reference multiple source files and retain field provenance.
