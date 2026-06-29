# Column Glossary Parser Alignment

Reviewed against `Accounting Project/Copy of Sales_Report_Column_Glossary - Column Glossary.csv`.

## Summary

The glossary is useful as a column-rule reference, but it is not enough by itself to create Airtable-ready rows. It tells us which amount column to use; Airtable export also requires customer, studio, memo period, date, vertical, validation, and source provenance.

I checked the sample-backed parser families against the glossary rules and changed these behaviors:

- AV now uses the header royalty as the control total while emitting studio-level postings from source studio labels.
- Girlfriends now reads one sheet-level monthly total from the April and May 2026 QuickBooks tabs and applies the 65 percent profit share, avoiding title/subtotal double counting.
- New Sensations now maps files to studios and reads only `Total Expenses` from the expenses sheet; it no longer treats summary rows as expenses.
- AdultTime is now review-gated because the glossary says the payable must be calculated by summing scene-level `Revshare` rows. The bundle preview proves the two PDF totals combine to the Airtable row, but the parser still does not persist scene rows.
- AEBN, Dorcel, KNPB, and AERONA now aggregate title/detail rows into Airtable-style studio postings where the source supports the split. Unresolved source/Airtable allocation differences stay review-only.

## Aligned Rules

| Glossary vendor | Parser family | Glossary amount rule | Current parser state |
| --- | --- | --- | --- |
| 1979 Media (Dorcel) | `xlsx_1979_dorcel` | Use `TOTAL H.T.` for period total; use `Reversement distributeur` for detail. | Uses `TOTAL H.T.`, reconciles detail, and emits 8 Airtable-matching studio postings for the sample. |
| ADE / AERONA rollup | `xlsx_aerona_rollup` | Use rollup `Total` / `Total VOD` as-is. | Uses component columns into `Total`; emits source-backed studio postings, with 4 allocation splits held for review. |
| AEBN / WMM Holdings | `xlsx_aebn_title` | Use `Total`; `Payout` screen is gross, not fee-netted. | Uses title `Total` and emits studio-level postings. 28 ready postings match Airtable; Raw Attack, Holly Randall, and BAEB `All Natural` residual stay review-only. |
| AMG | `xlsx_amg_mixed` | Use net `Payout`, but be careful because `Payout` meaning differs by vendor. | Uses payout logic and review-gates manual/highlighted rows per project mapping. |
| AV Entertainment | `xlsx_av_royalty_header` | Use header royalty dollar figure, not gross line `Total`. | Uses header royalty amount as control total and emits studio-level postings that sum to the header. April 2026 has no direct Airtable target row. |
| Dream Logistics | `pdf_invoice_lines` | Use subtotal minus listed adjustments. | Matches Airtable exactly for the sample. |
| Dusk | `xlsx_dusk_playlist` | Use footer `Payout`/`Total`; per-title payout columns are supporting detail. | Uses per-title payout columns to validate footer total and exports known Airtable split for sample. |
| Erigo / Load | `pdf_payment_narrative` | Manual transcription only. | Review-gated; does not auto-export. |
| Erika Lust | `xlsx_erika_summary` | Use `Total Royalties` / `SUM de Total Royalties`. | Matches Airtable exactly for the sample. |
| Gamma Licensing | `xlsx_gamma_running_balance` | Use `Net Royalty Due` for outstanding payable, not `Total Royalties`. | Matches Airtable exactly for the sample. |
| Girlfriends Films | `xlsx_girlfriends_quickbooks` | Sum `Total <Item>` rollup rows or `Amount` lines for period. | Uses one sheet-level total per month and applies 65 percent. April/May 2026 are parsed but not present in Airtable. |
| KNPB / DVD Erotik | `xlsx_knpb_credit_note` | Use `Total Income:` for period total and `T Revenue` for title detail. | Uses workbook total/detail and emits 29 Airtable-matching studio postings. |
| New Sensations | `xlsx_new_sensations_paid` | Use `Total Royalty Due`, not line `ExtensionAmt`. | Uses `Total Royalty Due` or `Total Royalty Due, Less Expense`, with file-to-studio mapping. April 2026 is parsed but not present in Airtable. |
| OMNet / Orgazmik | `xlsx_embedded_image_omnet` | Use `YOUR SHARE`, not gross `REVENUE`. | Review-gated because data is embedded-image style; should not auto-export. |
| Pulse Distribution | `xlsx_pulse_cumulative_balance` | Glossary says structure was not confirmed; open each file individually. | Parser opens each workbook and posts positive balances; negative NVG is suppressed. |

## Still Unclear Or Not Fully Implemented

| Area | Reason |
| --- | --- |
| AdultTime | Bundle preview matches Airtable exactly, but production export still needs scene-level `Revshare` persistence and a multi-file bundle report. |
| HPG | Not directly described in the glossary. Current parser uses revenue columns and reconciles file totals; bundle preview matches Airtable exactly, but production export still needs multi-file bundle creation. |
| Level5 | Glossary says no usable report/bank screenshot, while the local sample has a credit-note PDF. Treat local PDF parser as sample-specific and keep review sensitivity high. |
| AERONA / AEBN residuals | Amount columns match glossary, but a few Airtable splits require allocation policy that is not in the source file. |
| AV / Girlfriends / New Sensations / Level5 | Current source samples parse and reconcile, but their sample periods are not present as matching rows in the NMG Airtable workbook. |
