import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { buildAnalyticsCanonicalReport, extractRawTables, type AnalyticsClient } from "@/lib/analyticsFormat";
import { parseReportFromBufferForClient } from "@/lib/parserRunner";
import { requireSupabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const WRITE_BATCH_SIZE = 100;

export async function POST(request: Request) {
  const supabase = requireSupabaseAdmin();
  const formData = await request.formData();
  const upload = formData.get("file");
  const clientId = text(formData.get("client_id"));
  const reprocessDuplicate = formData.get("reprocess_duplicate") === "on";

  if (!(upload instanceof File)) {
    return NextResponse.json({ error: "Missing file upload." }, { status: 400 });
  }
  if (!clientId) {
    return NextResponse.json({ error: "Select a client before upload." }, { status: 400 });
  }

  const client = await getClient(clientId);
  const bytes = Buffer.from(await upload.arrayBuffer());
  const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
  const safeName = upload.name.replace(/[^\w.\-()[\] ]+/g, "_");
  const mediaType = upload.type || mediaTypeFromName(upload.name);
  const bucket = process.env.SOURCE_FILES_BUCKET || "source-files";
  const storagePath = `analytics/${sha256}/${safeName}`;
  const storageUri = `supabase://${bucket}/${storagePath}`;

  const sourceFile = await createOrGetSourceFile({
    clientId: client.id,
    originalFileName: upload.name,
    sha256,
    byteSize: bytes.length,
    mediaType,
    storageUri,
    reprocessDuplicate
  });

  if (sourceFile.duplicate && !reprocessDuplicate) {
    return NextResponse.redirect(new URL(`/analytics?duplicate=1&sha=${sha256.slice(0, 12)}`, request.url), { status: 303 });
  }

  try {
    await uploadOriginalFile(bucket, storagePath, bytes, mediaType);
    await updateSourceFile(sourceFile.id, { status: "processing", error_message: null });
    const parserResult = parseReportFromBufferForClient(bytes, upload.name, {
      clientKey: client.client_key,
      displayName: client.display_name,
      parserFamily: client.parser_family,
      currency: client.currency
    });
    const rawTables = extractRawTables(bytes, upload.name);
    const canonical = buildAnalyticsCanonicalReport(parserResult, client, upload.name, sha256, rawTables);
    const reportId = await persistAnalyticsReport({
      client,
      sourceFileId: sourceFile.id,
      sha256,
      fileName: upload.name,
      parserResult,
      canonical
    });
    await updateSourceFile(sourceFile.id, {
      status: "processed",
      metadata: {
        parser_family: canonical.report.parser_family,
        report_id: reportId,
        line_count: canonical.line_items.length
      }
    });
    return NextResponse.redirect(new URL(`/analytics/reports/${reportId}`, request.url), { status: 303 });
  } catch (error) {
    try {
      await updateSourceFile(sourceFile.id, { status: "failed", error_message: errorMessage(error) });
    } catch (statusError) {
      console.error("[analytics-upload] failed to mark source file failed", statusError);
    }
    return NextResponse.json(
      {
        error: "Unified report upload failed.",
        details: errorMessage(error),
        retryable: isRetryableSupabaseError(error)
      },
      { status: isRetryableSupabaseError(error) ? 503 : 500 }
    );
  }
}

async function getClient(clientId: string): Promise<AnalyticsClient> {
  const supabase = requireSupabaseAdmin();
  const { data, error } = await withSupabaseRetry("load analytics client", () =>
    supabase
      .from("analytics_clients")
      .select("id, client_key, display_name, parser_family, currency, vertical")
      .eq("id", clientId)
      .eq("enabled", true)
      .maybeSingle()
  );

  if (error) {
    throw error;
  }
  if (!data) {
    throw new Error("Selected analytics client was not found. Run supabase/sql/007_analytics_ingestion.sql first.");
  }
  return data as AnalyticsClient;
}

async function uploadOriginalFile(bucket: string, storagePath: string, bytes: Buffer, mediaType: string) {
  const supabase = requireSupabaseAdmin();
  const { error } = await withSupabaseRetry("upload original source file", () =>
    supabase.storage.from(bucket).upload(storagePath, bytes, {
      contentType: mediaType,
      upsert: false
    })
  );

  if (error && !/already exists|duplicate/i.test(error.message)) {
    throw error;
  }
}

async function createOrGetSourceFile(values: {
  clientId: string;
  originalFileName: string;
  sha256: string;
  byteSize: number;
  mediaType: string;
  storageUri: string;
  reprocessDuplicate: boolean;
}): Promise<{ id: string; duplicate: boolean }> {
  const supabase = requireSupabaseAdmin();
  const existing = await withSupabaseRetry("find duplicate analytics source file", () =>
    supabase.from("analytics_source_files").select("id").eq("sha256", values.sha256).maybeSingle()
  );
  if (existing.error) {
    throw existing.error;
  }
  if (existing.data) {
    await updateSourceFile(existing.data.id, {
      client_id: values.clientId,
      original_file_name: values.originalFileName,
      media_type: values.mediaType,
      storage_uri: values.storageUri,
      status: values.reprocessDuplicate ? "uploaded" : "duplicate"
    });
    return { id: existing.data.id, duplicate: true };
  }

  const { data, error } = await withSupabaseRetry("insert analytics source file", () =>
    supabase
      .from("analytics_source_files")
      .insert({
        client_id: values.clientId,
        original_file_name: values.originalFileName,
        sha256: values.sha256,
        byte_size: values.byteSize,
        media_type: values.mediaType,
        storage_uri: values.storageUri,
        status: "uploaded",
        metadata: {
          reprocess_duplicate: values.reprocessDuplicate
        }
      })
      .select("id")
      .single()
  );

  if (error) {
    throw error;
  }
  return { id: data.id, duplicate: false };
}

async function updateSourceFile(sourceFileId: string, patch: Record<string, unknown>) {
  const supabase = requireSupabaseAdmin();
  const { error } = await withSupabaseRetry("update analytics source file", () =>
    supabase.from("analytics_source_files").update(patch).eq("id", sourceFileId)
  );
  if (error) {
    throw error;
  }
}

async function persistAnalyticsReport(args: {
  client: AnalyticsClient;
  sourceFileId: string;
  sha256: string;
  fileName: string;
  parserResult: ReturnType<typeof parseReportFromBufferForClient>;
  canonical: ReturnType<typeof buildAnalyticsCanonicalReport>;
}): Promise<string> {
  const supabase = requireSupabaseAdmin();
  const reportPayload = {
    client_id: args.client.id,
    source_file_id: args.sourceFileId,
    report_key: args.canonical.report.report_key,
    vendor: args.canonical.report.client_name,
    report_family: args.canonical.report.parser_family,
    parser_family: args.canonical.report.parser_family,
    parser_version: args.canonical.report.parser_version,
    config_version: args.canonical.report.config_version,
    status: normalizeReportStatus(args.canonical.report.status),
    source_file_name: args.fileName,
    source_sha256: args.sha256,
    period_start: args.canonical.period.start_date,
    period_end: args.canonical.period.end_date,
    period_label: args.canonical.period.label,
    currency: args.canonical.currency,
    source_total: args.canonical.totals.source_total,
    line_items_total: args.canonical.totals.line_items_total,
    postings_total: args.canonical.totals.postings_total,
    total_difference: args.canonical.totals.difference,
    canonical_report_json: compactCanonicalReport(args.canonical),
    parser_output_json: compactParserOutput(args.parserResult.normalized_report),
    classification_json: args.parserResult.classification
  };

  const { data: report, error } = await withSupabaseRetry("upsert analytics report", () =>
    supabase
      .from("analytics_reports")
      .upsert(reportPayload, { onConflict: "report_key" })
      .select("id")
      .single()
  );

  if (error) {
    throw error;
  }

  await resetReportChildren(report.id);
  await insertRawTables(report.id, args.canonical.raw_tables);
  await insertLines(report.id, args.canonical.line_items);
  await insertTotals(report.id, args.canonical);
  await insertProvenance(report.id, args.parserResult);
  return report.id;
}

async function resetReportChildren(reportId: string) {
  const supabase = requireSupabaseAdmin();
  for (const table of ["analytics_field_provenance", "analytics_report_totals", "analytics_report_lines", "analytics_raw_tables"]) {
    const { error } = await withSupabaseRetry(`delete old ${table}`, () =>
      supabase.from(table).delete().eq("analytics_report_id", reportId)
    );
    if (error) {
      throw error;
    }
  }
}

async function insertRawTables(reportId: string, rawTables: ReturnType<typeof extractRawTables>) {
  const supabase = requireSupabaseAdmin();
  if (rawTables.length === 0) return;
  const rows = rawTables.map((table) => ({
    analytics_report_id: reportId,
    table_key: table.table_key,
    table_name: table.table_name,
    table_type: table.table_type,
    row_count: table.row_count,
    column_count: table.column_count,
    columns: table.columns,
    rows_json: table.rows,
    metadata: table.metadata
  }));
  for (const batch of chunk(rows, WRITE_BATCH_SIZE)) {
    const { error } = await withSupabaseRetry("insert analytics raw table previews", () =>
      supabase.from("analytics_raw_tables").insert(batch)
    );
    if (error) throw error;
  }
}

async function insertLines(reportId: string, lines: ReturnType<typeof buildAnalyticsCanonicalReport>["line_items"]) {
  const supabase = requireSupabaseAdmin();
  if (lines.length === 0) return;
  const rows = lines.map((line) => ({
    analytics_report_id: reportId,
    ...line,
    raw_fields: compactJson(line.raw_fields, 12000),
    source_location: compactJson(line.source_location, 4000)
  }));
  for (const batch of chunk(rows, WRITE_BATCH_SIZE)) {
    const { error } = await withSupabaseRetry("insert analytics report lines", () =>
      supabase.from("analytics_report_lines").insert(batch)
    );
    if (error) throw error;
  }
}

async function insertTotals(reportId: string, canonical: ReturnType<typeof buildAnalyticsCanonicalReport>) {
  const supabase = requireSupabaseAdmin();
  const { error } = await withSupabaseRetry("insert analytics report totals", () =>
    supabase.from("analytics_report_totals").insert({
      analytics_report_id: reportId,
      source_total: canonical.totals.source_total,
      line_items_total: canonical.totals.line_items_total,
      postings_total: canonical.totals.postings_total,
      difference: canonical.totals.difference,
      currency: canonical.totals.currency,
      validation_status: canonical.validation.status,
      warnings: canonical.validation.warnings,
      errors: canonical.validation.errors
    })
  );
  if (error) {
    throw error;
  }
}

async function insertProvenance(reportId: string, result: ReturnType<typeof parseReportFromBufferForClient>) {
  const supabase = requireSupabaseAdmin();
  const rows = result.field_provenance.map((item) => {
    const source = item as Record<string, any>;
    return {
      analytics_report_id: reportId,
      source_line_id: stringOrNull(source.record_key),
      field_path: String(source.field_path ?? ""),
      value_json: source.value_json ?? null,
      source_sheet: stringOrNull(source.source_sheet),
      source_page: numericInt(source.source_page),
      source_row: numericInt(source.source_row),
      source_column: stringOrNull(source.source_column),
      source_cell_range: stringOrNull(source.source_cell_range),
      parser_family: String(result.report.parser_family ?? result.classification.parser_family ?? "")
    };
  }).filter((row) => row.field_path);

  for (const batch of chunk(rows, WRITE_BATCH_SIZE)) {
    const { error } = await withSupabaseRetry("insert analytics field provenance", () =>
      supabase.from("analytics_field_provenance").insert(batch)
    );
    if (error) throw error;
  }
}

function compactCanonicalReport(canonical: ReturnType<typeof buildAnalyticsCanonicalReport>) {
  return {
    ...canonical,
    raw_tables: canonical.raw_tables.map((table) => ({
      table_key: table.table_key,
      table_name: table.table_name,
      table_type: table.table_type,
      row_count: table.row_count,
      column_count: table.column_count,
      columns: table.columns,
      metadata: table.metadata
    })),
    line_items: [],
    storage_note: "Line rows are stored in analytics_report_lines; raw table previews are stored in analytics_raw_tables."
  };
}

function compactParserOutput(output: Record<string, unknown>) {
  const lineItems = Array.isArray(output.line_items) ? output.line_items : [];
  const postings = Array.isArray(output.accounting_postings) ? output.accounting_postings : [];
  return {
    ...output,
    line_items: [],
    accounting_postings: [],
    storage_note: {
      line_items_count: lineItems.length,
      accounting_postings_count: postings.length,
      message: "Detailed rows are stored in analytics_report_lines and existing Airtable parser tables."
    }
  };
}

function compactJson(value: unknown, maxChars: number): unknown {
  const serialized = JSON.stringify(value ?? {});
  if (serialized.length <= maxChars) {
    return value;
  }
  return {
    _truncated: true,
    _original_char_length: serialized.length,
    _preview: serialized.slice(0, maxChars)
  };
}

async function withSupabaseRetry<T extends { error: unknown }>(label: string, operation: () => PromiseLike<T>): Promise<T> {
  const maxAttempts = 3;
  let lastResult: T | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const result = await operation();
      if (!result.error) {
        return result;
      }
      lastResult = result;
      if (!isRetryableSupabaseError(result.error) || attempt === maxAttempts) {
        return result;
      }
      console.warn(`[analytics-upload] retrying ${label} after Supabase error`, {
        attempt,
        error: errorMessage(result.error)
      });
    } catch (error) {
      if (!isRetryableSupabaseError(error) || attempt === maxAttempts) {
        throw error;
      }
      console.warn(`[analytics-upload] retrying ${label} after thrown error`, {
        attempt,
        error: errorMessage(error)
      });
    }
    await sleep(750 * attempt * attempt);
  }

  return lastResult as T;
}

function mediaTypeFromName(fileName: string): string {
  const suffix = fileName.split(".").pop()?.toLowerCase();
  if (suffix === "xlsx") return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (suffix === "xls") return "application/vnd.ms-excel";
  if (suffix === "csv") return "text/csv";
  if (suffix === "pdf") return "application/pdf";
  if (suffix === "docx") return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (suffix === "png") return "image/png";
  if (suffix === "jpg" || suffix === "jpeg") return "image/jpeg";
  return "application/octet-stream";
}

function normalizeReportStatus(status: string): string {
  return ["ready", "review", "blocked", "suppressed", "failed"].includes(status) ? status : "review";
}

function text(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value.trim() : "";
}

function stringOrNull(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  return String(value);
}

function numericInt(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isInteger(numeric) ? numeric : null;
}

function chunk<T>(items: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }
  return batches;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableSupabaseError(error: unknown): boolean {
  if (!error) return false;
  const value = error as Record<string, unknown>;
  const status = Number(value.status ?? value.statusCode ?? value.code);
  const message = errorMessage(error);
  return (
    status === 520 ||
    status === 502 ||
    status === 503 ||
    status === 504 ||
    /cloudflare|unknown_origin_error|error 520|timeout|timed out|fetch failed|econnreset|etimedout|retryable/i.test(message)
  );
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object") {
    const value = error as {
      code?: unknown;
      status?: unknown;
      statusCode?: unknown;
      title?: unknown;
      message?: unknown;
      detail?: unknown;
      details?: unknown;
      hint?: unknown;
      error_code?: unknown;
      error_name?: unknown;
      retry_after?: unknown;
    };
    const parts = [
      value.code,
      value.status,
      value.statusCode,
      value.title,
      value.message,
      value.detail,
      value.details,
      value.hint,
      value.error_code,
      value.error_name,
      value.retry_after ? `retry_after=${value.retry_after}` : null
    ].filter(Boolean).map(String);
    if (parts.length > 0) return parts.join(" | ");
  }
  return String(error);
}
