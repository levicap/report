# Source Reports To NMG Airtable Mapping

The sample reports are raw source evidence from platforms, vendors, or customers.
The NMG Airtable Data Entry sheet is the destination accounting table.

The app does not copy every source row directly into Airtable. It does this:

1. Store the original file and hash.
2. Parse source rows into normalized `line_items`.
3. Validate totals against the source report.
4. Create `accounting_postings`.
5. Export each ready `accounting_posting` as one NMG Airtable row.

## Airtable Columns

| NMG Airtable column | Comes from |
| --- | --- |
| Customer | Billing customer after `customer_lookup.csv` mapping. |
| Studio | Studio allocation after source alias mapping. Blank means current output is aggregate. |
| Amount | Final payable amount, not gross sales. |
| Memo | Vendor/report period text using historical Airtable style where known. |
| Invoice Date | Usually report period end or payout processing month end. |
| Due Date | Usually invoice date plus customer terms, often two months. |
| Vertical | Controlled value: `VOD`, `DVD`, or `Licensing`. |
| Date Entered | Generated at export time. |
| Date Added to Airtable | Generated at export time or Airtable accepted date. |
| Antoinette or Val Invoice# | Source invoice number or historical internal invoice number when known. |

## Important Distinction

`line_items` are the detailed extracted source facts.

Examples:
- title rows
- scene rows
- producer rows
- source row/page/sheet location
- gross amount
- share rate
- source studio text

`accounting_postings` are the rows that become the NMG Airtable Data Entry rows.

Examples:
- one row per studio
- one row per source file
- one aggregate row when accounting policy does not yet define a split

## Current Sample Mapping

| Report family | Source report data extracted | NMG Airtable rows created |
| --- | --- | --- |
| 1979 Media Dorcel | Summary `TOTAL H.T.`, section totals, Q4 delta adjustment, title/detail rows. | Eight studio-level Licensing rows for the Q1 2026 sample; all match NMG Airtable exactly. |
| AERONA rollup | `Item ID`, `Title`, `Studio`, `Total`, plus `PPM`, `Rental`, `Download`, `Stream for Life`, `Scenes`, `Unlimited`. | Studio-level VOD rows where allocation is source-backed; 28 rows match Airtable, while BAEB, Carnal Network, JayRock, and TrueX split residuals stay review-only. |
| AMG mixed workbook | `Lic. Fee`, `25% Dist. Fee`, `Payout`, territory, title/report code. | Review-gated. The workbook includes manual highlighted rows, so it should not auto-export until accounting confirms the split. |
| AV Entertainment | Header `35% Royalty`, title rows, source studio, quantity, gross `Total`; app applies 35%. | Studio-level VOD rows mapped from source studio labels. The April 2026 sample reconciles to the 907.45 USD header total, but that month is not present in the NMG Airtable workbook. |
| Dream Logistics PDF | Invoice number, Q1 description lines, studio labels, total prices, subtotal/final total. | Four VOD rows: Charged Media LLC, AMA Multimedia LLC, EENT Inc., Carnal Media LLC. |
| Dusk playlist | Title labels, duration seconds, `Pay-Out NL`, `Pay-Out INT`, footer total. | Two Licensing rows for April 2026: AMA Multimedia LLC and SARJ LLC, matching historical NMG sheet style. |
| Erigo PDF | Metart final, exchange rate, USD amount, `TOTAL USD PAYMENT`, Team Skeet zero section. | Review-gated DVD rows. Proposed row is `ERIGO` / `SARJ LLC` for 461.85 USD, but currency-label issue requires human review. |
| Erika Lust | Producer summary totals: streaming, store, total royalties. Detail table is retained as incomplete warning context. | Seven Licensing rows by historical studio mapping, including SARJ LLC:MetArt, EFC GmbH:Lustery, NF Media Inc:Nubile Films, etc. |
| Gamma Licensing | Monthly summary `VOD`, `Linear`, `SVOD`, current total royalties, running `Net Royalty Due`, wire fee, final payable. | One Licensing row for `Gamma Broadcast Group Inc.` / `EENT Inc.` using the highlighted payable. |
| Gamma Adult Time | PDF report grand totals; scene-level fields are known source fields but full scene persistence is follow-up. | Review-gated per-PDF candidate rows. The bundle preview sums the two April PDFs to 959.51 USD and matches the single NMG Airtable row exactly; automatic export still waits on scene-level `Revshare` persistence. |
| Girlfriends Films | Monthly QuickBooks workbook total rows and 65% profit share. | Separate DVD postings for April 2026 and May 2026 under SARJ LLC. The sample months are not present in the NMG Airtable workbook. |
| HPG Canal/Netgem/Proximus | Title, quantity/purchases, dynamic revenue column, channel/platform totals. | File-level candidate postings are review-only. The bundle preview creates the Airtable row shape by month, canonical studio, and March batch; all 40 preview rows match NMG Airtable exactly. |
| KNPB credit note | `Total Income`, download/rental counts, `DL Revenue`, `RT Revenue`, `T Revenue`, title rows. | Studio-level VOD rows; all 29 sample postings match NMG Airtable exactly. |
| Level5 PDF | Studio totals for SexArt, StrapLez, Viv Thomas; sales/rentals/subscription-share components; total net. | Three VOD rows: SARJ LLC:SexArt, SARJ LLC:StrapLez, SARJ LLC:Viv Thomas. |
| New Sensations | Paid lines, shipped quantity, extension amount, 30% distribution fee, expenses. | One DVD row per workbook with filename-to-studio mapping and expense handling. April 2026 is parsed and reconciled, but that month is not present in the NMG Airtable workbook. |
| OMNet image workbook | Audited image total: gross revenue and `YOUR SHARE`. | Review-gated. Proposed aggregate VOD row exists, but export is blocked until image extraction and studio-code mapping are approved. |
| Pulse cumulative balance | Final `Net Royalty Due` or `Balance Due`, plus cumulative sales/payments/expenses context. | One DVD row per positive workbook. Negative balances are suppressed, not exported. |
| Sonifi DOCX | TitleID, title, buys, sales, rate, royalty; grand sales and royalty totals. | Blocked. Source extraction works, but no Airtable postings are created until studio allocation policy is approved. |
| AEBN title payout | Title rows, studio, line total, portal/payout reconciliation. | Studio-level VOD rows. Twenty-eight source-backed postings match Airtable; Raw Attack, Holly Randall, and BAEB `All Natural` remain review-only due source/Airtable allocation differences. |

## What To Check While Testing

For a report to export, the report must have ready `accounting_postings`.

If a report only has `line_items`, that means the app extracted source data but does not yet have a safe accounting posting policy.

If a report is `review` or `blocked`, the app is intentionally not sending it to Airtable even if it knows the amount.

For cross-file bundles such as HPG and AdultTime, the parser can prove the Airtable-shaped totals in `docs/bundle_preview.md`, but the production app still needs a bundle creation step so one export row can retain provenance to multiple source files.
