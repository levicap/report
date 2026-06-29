# Accounting Normalization Dashboard

Phase one implementation scaffold for report intake, deterministic parsing, validation, review, PostgreSQL/Supabase storage, and Airtable-ready export generation.

## What Is Included

- Supabase SQL setup in `supabase/sql/001_setup.sql`.
- Reference seed SQL in `supabase/sql/002_seed_reference.sql`.
- TypeScript parser/normalizer in `lib/normalizer`.
- Next.js admin dashboard in `app`.
- Server-side upload route that hashes files, stores originals, detects duplicates, calls the TypeScript parser, and writes normalized records to Supabase.
- Export route that writes an export audit row and produces Airtable-compatible output. It downloads CSV by default; direct Airtable API sending requires explicit opt-in with `AIRTABLE_ENABLE_API_SEND=true`.

## Local Setup

1. Run the SQL files in Supabase SQL editor in this order:
   - `supabase/sql/001_setup.sql`
   - `supabase/sql/002_seed_reference.sql`
   - `supabase/sql/004_platform_fallback_views.sql`
   - `supabase/sql/005_backfill_report_references.sql`
2. Set environment variables from `.env.example`. Airtable-compatible CSV generation is the v1 default. Direct Airtable API sending is disabled unless `AIRTABLE_ENABLE_API_SEND=true` is set:
   - `AIRTABLE_ENABLE_API_SEND`
   - `AIRTABLE_API_KEY`
   - `AIRTABLE_BASE_ID`
   - `AIRTABLE_TABLE_NAME`
3. Install dependencies with `npm install`.
4. Start the app with `npm run dev`.

The dashboard uses the Supabase service role key only on server routes. Do not expose that key to browser code.

If a parser changes after a file has already been uploaded, upload the same file again with **Reprocess duplicate** checked. The original duplicate hash is retained, but parser-derived records, validations, provenance, and review items are replaced with the fresh parser output.

## Current Parser Coverage

Implemented:

- Hash and manifest-based classification from `accounting_normalization_package/file_manifest.csv`.
- Parser profile policy loading from `vendor_mapping_config.json`.
- Deterministic workbook parsers for Dusk, HPG, Pulse, New Sensations, 1979/Dorcel, AEBN, Gamma, Girlfriends Films, KNPB, AERONA, AMG, AV royalty headers, and producer summary workbooks.
- Review-gated fallback for known document/image formats and parser families that still require human verification.
- Review-gated fallback for unknown formats.

Run `npm run test:parsers` to test every parser family against the real sample corpus and regenerate `docs/parser_function_test_summary.md`, `docs/parser_mapping_results.csv`, and fixture outputs.

Next parser families should be added under `lib/normalizer/parsers.ts` using the same output contract.
