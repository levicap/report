import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { requireSupabaseAdmin } from "@/lib/supabaseAdmin";
import { parseReportFromBuffer, type ParserResult } from "@/lib/parserRunner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type InsertedRecord = {
  id: string;
  record_key: string;
};

const WRITE_BATCH_SIZE = 250;
const DELETE_BATCH_SIZE = 100;
const PERSIST_DETAIL_RECORDS = process.env.PERSIST_DETAIL_RECORDS === "true";

export async function POST(request: Request) {
  const supabase = requireSupabaseAdmin();
  const formData = await request.formData();
  const upload = formData.get("file");

  if (!(upload instanceof File)) {
    return NextResponse.json({ error: "Missing file upload." }, { status: 400 });
  }
  const reprocessDuplicate = formData.get("reprocess_duplicate") === "on";

  const bytes = Buffer.from(await upload.arrayBuffer());
  const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
  const safeName = upload.name.replace(/[^\w.\-()[\] ]+/g, "_");
  const mediaType = upload.type || mediaTypeFromName(upload.name);
  const bucket = process.env.SOURCE_FILES_BUCKET || "source-files";
  const storagePath = `${sha256}/${safeName}`;
  const storageUri = `supabase://${bucket}/${storagePath}`;

  await uploadOriginalFile(supabase, bucket, storagePath, bytes, mediaType);

  const blob = await createOrGetBlob(supabase, {
    sha256,
    byte_size: bytes.length,
    media_type: mediaType,
    original_storage_uri: storageUri
  });

  const { data: firstFile } = await supabase
    .from("source_files")
    .select("id")
    .eq("blob_id", blob.id)
    .order("received_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const isDuplicate = Boolean(firstFile);
  const { data: sourceFile, error: sourceFileError } = await supabase
    .from("source_files")
    .insert({
      blob_id: blob.id,
      original_file_name: upload.name,
      received_channel: "manual_upload",
      received_path: storageUri,
      duplicate_of_source_file_id: firstFile?.id ?? null,
      status: isDuplicate && !reprocessDuplicate ? "duplicate" : "queued",
      source_metadata: {
        storage_bucket: bucket,
        storage_path: storagePath,
        media_type: mediaType,
        reprocess_duplicate: isDuplicate && reprocessDuplicate
      }
    })
    .select("id")
    .single();

  if (sourceFileError) {
    throw sourceFileError;
  }

  if (isDuplicate && !reprocessDuplicate) {
    return NextResponse.redirect(new URL("/?duplicate=1", request.url), { status: 303 });
  }

  try {
    await markSourceFileStatus(supabase, sourceFile.id, "processing");
    const parserResult = parseReportFromBuffer(bytes, upload.name);
    if (parserResult.classification.status === "reference_file") {
      await markSourceFileStatus(supabase, sourceFile.id, "ignored", undefined, {
        ignored_reason: parserResult.classification.reason,
        classification: parserResult.classification
      });
      return NextResponse.redirect(new URL("/?ignored=1", request.url), { status: 303 });
    }
    await persistParserResult(supabase, sourceFile.id, parserResult);
    await markSourceFileStatus(supabase, sourceFile.id, parserResult.report.status === "review" ? "processed" : "processed");
  } catch (error) {
    await markSourceFileStatus(supabase, sourceFile.id, "failed", errorMessage(error));
    throw error;
  }

  return NextResponse.redirect(new URL("/", request.url), { status: 303 });
}

async function uploadOriginalFile(
  supabase: ReturnType<typeof requireSupabaseAdmin>,
  bucket: string,
  storagePath: string,
  bytes: Buffer,
  mediaType: string
) {
  const { error } = await supabase.storage.from(bucket).upload(storagePath, bytes, {
    contentType: mediaType,
    upsert: false
  });

  if (error && !/already exists|duplicate/i.test(error.message)) {
    throw error;
  }
}

async function createOrGetBlob(
  supabase: ReturnType<typeof requireSupabaseAdmin>,
  values: {
    sha256: string;
    byte_size: number;
    media_type: string;
    original_storage_uri: string;
  }
) {
  const existing = await supabase.from("source_file_blobs").select("id, sha256").eq("sha256", values.sha256).maybeSingle();
  if (existing.error) {
    throw existing.error;
  }
  if (existing.data) {
    return existing.data;
  }

  const { data, error } = await supabase.from("source_file_blobs").insert(values).select("id, sha256").single();

  if (error) {
    if (isDuplicateKeyError(error)) {
      const racedExisting = await supabase.from("source_file_blobs").select("id, sha256").eq("sha256", values.sha256).maybeSingle();
      if (racedExisting.error) {
        throw racedExisting.error;
      }
      if (racedExisting.data) {
        return racedExisting.data;
      }
    }
    throw error;
  }
  return data;
}

function isDuplicateKeyError(error: { code?: string; message?: string }) {
  return error.code === "23505" || /duplicate key|already exists|unique constraint/i.test(error.message ?? "");
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (error && typeof error === "object") {
    const value = error as { code?: unknown; message?: unknown; details?: unknown; hint?: unknown };
    const parts = [value.code, value.message, value.details, value.hint].filter(Boolean).map(String);
    if (parts.length > 0) {
      return parts.join(" | ");
    }
    return JSON.stringify(error);
  }
  return String(error);
}

async function markSourceFileStatus(
  supabase: ReturnType<typeof requireSupabaseAdmin>,
  sourceFileId: string,
  status: "processing" | "processed" | "failed" | "ignored",
  failureMessage?: string,
  metadataPatch?: Record<string, unknown>
) {
  const payload: Record<string, unknown> = { status, failure_message: failureMessage ?? null };
  if (metadataPatch) {
    const existing = await supabase.from("source_files").select("source_metadata").eq("id", sourceFileId).maybeSingle();
    if (existing.error) {
      throw existing.error;
    }
    payload.source_metadata = {
      ...((existing.data?.source_metadata as Record<string, unknown> | null) ?? {}),
      ...metadataPatch
    };
  }
  const { error } = await supabase
    .from("source_files")
    .update(payload)
    .eq("id", sourceFileId);

  if (error) {
    throw error;
  }
}

async function persistParserResult(supabase: ReturnType<typeof requireSupabaseAdmin>, sourceFileId: string, result: ParserResult) {
  const platformId = await findPlatformId(supabase, String(result.classification.vendor_id ?? ""));
  const parserProfileId = await findParserProfileId(supabase, String(result.report.parser_family ?? ""));

  const reportPayload = {
    ...result.report,
    platform_id: platformId,
    parser_profile_id: parserProfileId,
    normalized_report: compactReportJson(result)
  };

  const { data: report, error: reportError } = await supabase
    .from("reports")
    .upsert(reportPayload, { onConflict: "report_key" })
    .select("id")
    .single();

  if (reportError) {
    throw reportError;
  }

  await supabase.from("report_source_files").upsert(
    {
      report_id: report.id,
      source_file_id: sourceFileId,
      role: normalizeSourceRole(String(result.classification.source_role ?? "primary")),
      authoritative: Boolean(result.classification.authoritative),
      source_locator: String(result.classification.reason ?? "")
    },
    { onConflict: "report_id,source_file_id,role" }
  );

  await resetReportDerivedData(supabase, report.id);

  const run = await insertProcessingRun(supabase, {
    source_file_id: sourceFileId,
    report_id: report.id,
    parser_profile_id: parserProfileId,
    input_sha256: result.source_hash,
    parser_family: String(result.report.parser_family ?? ""),
    parser_version: String(result.report.parser_version ?? "1.0.0"),
    config_version: String(result.report.config_version ?? "1.0.0")
  });

  const criticalRecordIdByKey = await insertRecordsByType(supabase, report.id, parserProfileId, result, (record) => record.record_type !== "line_item");
  await insertProvenance(supabase, report.id, sourceFileId, parserProfileId, criticalRecordIdByKey, result, (item) =>
    !item.record_key || criticalRecordIdByKey.has(String(item.record_key))
  );
  await insertValidationResults(supabase, report.id, run.id, result.validation_results);
  await insertReconciliation(supabase, report.id, result.reconciliation_snapshots);
  await insertReviewItems(supabase, report.id, criticalRecordIdByKey, result.review_items);

  if (platformId) {
    await supabase.from("source_files").update({ platform_id: platformId, parser_profile_id: parserProfileId }).eq("id", sourceFileId);
  }

  if (!PERSIST_DETAIL_RECORDS) {
    await patchSourceFileMetadata(supabase, sourceFileId, {
      detail_persistence: "deferred",
      detail_record_count: result.records.filter((record) => record.record_type === "line_item").length,
      detail_provenance_count: result.field_provenance.filter((item) => item.record_key && !criticalRecordIdByKey.has(String(item.record_key))).length
    });
    return;
  }

  const detailRecordIdByKey = await insertRecordsByType(supabase, report.id, parserProfileId, result, (record) => record.record_type === "line_item");
  await insertProvenance(supabase, report.id, sourceFileId, parserProfileId, detailRecordIdByKey, result, (item) =>
    Boolean(item.record_key && detailRecordIdByKey.has(String(item.record_key)))
  );
}

async function resetReportDerivedData(supabase: ReturnType<typeof requireSupabaseAdmin>, reportId: string) {
  for (const table of ["record_comments", "review_items", "validation_results", "field_provenance", "report_records"]) {
    await deleteReportRowsInBatches(supabase, table, reportId);
  }
}

async function findPlatformId(supabase: ReturnType<typeof requireSupabaseAdmin>, platformKey: string): Promise<string | null> {
  if (!platformKey) {
    return null;
  }
  const { data } = await supabase.from("platforms").select("id").eq("platform_key", platformKey).maybeSingle();
  return data?.id ?? null;
}

async function findParserProfileId(supabase: ReturnType<typeof requireSupabaseAdmin>, parserFamily: string): Promise<string | null> {
  if (!parserFamily) {
    return null;
  }
  const { data } = await supabase.from("parser_profiles").select("id").eq("parser_family", parserFamily).eq("enabled", true).limit(1).maybeSingle();
  return data?.id ?? null;
}

async function insertProcessingRun(
  supabase: ReturnType<typeof requireSupabaseAdmin>,
  values: Record<string, unknown>
) {
  const { data, error } = await supabase
    .from("processing_runs")
    .insert({
      ...values,
      stage: "parse",
      status: "succeeded",
      started_at: new Date().toISOString(),
      finished_at: new Date().toISOString()
    })
    .select("id")
    .single();

  if (error) {
    throw error;
  }
  return data;
}

async function insertRecordsByType(
  supabase: ReturnType<typeof requireSupabaseAdmin>,
  reportId: string,
  parserProfileId: string | null,
  result: ParserResult,
  includeRecord: (record: Record<string, any>) => boolean
): Promise<Map<string, InsertedRecord>> {
  const rows = result.records
    .filter(includeRecord)
    .map((record) => ({
      report_id: reportId,
      record_key: record.record_key,
      record_type: record.record_type,
      status: record.status,
      normalized_json: record.normalized_json,
      amount: record.amount ?? null,
      currency: record.currency ?? null,
      parser_profile_id: parserProfileId,
      parser_family: result.report.parser_family,
      parser_version: result.report.parser_version,
      config_version: result.report.config_version,
      source_line_ids: record.source_line_ids ?? []
    }));

  if (rows.length === 0) {
    return new Map();
  }

  const inserted: InsertedRecord[] = [];
  for (const batch of chunk(rows, WRITE_BATCH_SIZE)) {
    const { data, error } = await supabase
      .from("report_records")
      .insert(batch)
      .select("id, record_key");

    if (error) {
      throw error;
    }
    inserted.push(...((data ?? []) as InsertedRecord[]));
  }

  return new Map(inserted.map((record) => [record.record_key, record]));
}

async function insertValidationResults(
  supabase: ReturnType<typeof requireSupabaseAdmin>,
  reportId: string,
  processingRunId: string,
  results: Array<Record<string, unknown>>
) {
  if (results.length === 0) {
    return;
  }

  const rows = results.map((item) => ({
    report_id: reportId,
    processing_run_id: processingRunId,
    check_name: item.check_name,
    status: item.status,
    severity: item.severity ?? "error",
    message: item.message,
    declared_amount: item.declared_amount ?? null,
    computed_amount: item.computed_amount ?? null,
    difference_amount: item.difference_amount ?? null,
    tolerance_amount: item.tolerance_amount ?? null,
    currency: normalizeCurrency(item.currency),
    details: item.details ?? {}
  }));

  await insertRowsInBatches(supabase, "validation_results", rows);
}

async function insertProvenance(
  supabase: ReturnType<typeof requireSupabaseAdmin>,
  reportId: string,
  sourceFileId: string,
  parserProfileId: string | null,
  recordIdByKey: Map<string, InsertedRecord>,
  result: ParserResult,
  includeItem: (item: Record<string, any>) => boolean
) {
  if (result.field_provenance.length === 0) {
    return;
  }

  const rows = result.field_provenance
    .filter(includeItem)
    .map((item) => ({
      report_id: reportId,
      report_record_id: item.record_key ? recordIdByKey.get(String(item.record_key))?.id ?? null : null,
      field_path: item.field_path,
      value_json: item.value_json ?? null,
      source_file_id: sourceFileId,
      source_sheet: item.source_sheet ?? null,
      source_page: item.source_page ?? null,
      source_row: item.source_row ?? null,
      source_column: item.source_column ?? null,
      source_cell_range: item.source_cell_range ?? null,
      image_name: item.image_name ?? null,
      parser_profile_id: parserProfileId,
      parser_family: result.report.parser_family,
      parser_version: result.report.parser_version,
      config_version: result.report.config_version,
      extraction_confidence: item.extraction_confidence ?? null
    }));

  if (rows.length === 0) {
    return;
  }

  await insertRowsInBatches(supabase, "field_provenance", rows);
}

async function insertReconciliation(
  supabase: ReturnType<typeof requireSupabaseAdmin>,
  reportId: string,
  snapshots: Array<Record<string, unknown>>
) {
  if (snapshots.length === 0) {
    return;
  }

  const rows = snapshots.map((item) => ({
    report_id: reportId,
    stage: item.stage,
    amount: item.amount ?? null,
    currency: normalizeCurrency(item.currency),
    record_count: item.record_count ?? 0,
    validation_status: item.validation_status ?? "failed",
    tolerance_amount: item.tolerance_amount ?? "0.01",
    components: item.components ?? {},
    details: item.details ?? {}
  }));

  await insertRowsInBatches(supabase, "reconciliation_snapshots", rows);
}

async function insertReviewItems(
  supabase: ReturnType<typeof requireSupabaseAdmin>,
  reportId: string,
  recordIdByKey: Map<string, InsertedRecord>,
  items: Array<Record<string, unknown>>
) {
  if (items.length === 0) {
    return;
  }

  const rows = items.map((item) => ({
    report_id: reportId,
    report_record_id: item.record_key ? recordIdByKey.get(String(item.record_key))?.id ?? null : null,
    status: "open",
    priority: item.priority ?? 3,
    reason: item.reason,
    original_value: item.original_value ?? null,
    proposed_value: item.proposed_value ?? null
  }));

  await insertRowsInBatches(supabase, "review_items", rows);
}

async function insertRowsInBatches(
  supabase: ReturnType<typeof requireSupabaseAdmin>,
  table: string,
  rows: Array<Record<string, unknown>>
) {
  for (const batch of chunk(rows, WRITE_BATCH_SIZE)) {
    const { error } = await supabase.from(table).insert(batch);
    if (error) {
      throw error;
    }
  }
}

async function patchSourceFileMetadata(
  supabase: ReturnType<typeof requireSupabaseAdmin>,
  sourceFileId: string,
  metadataPatch: Record<string, unknown>
) {
  const existing = await supabase.from("source_files").select("source_metadata").eq("id", sourceFileId).maybeSingle();
  if (existing.error) {
    throw existing.error;
  }
  const { error } = await supabase
    .from("source_files")
    .update({
      source_metadata: {
        ...((existing.data?.source_metadata as Record<string, unknown> | null) ?? {}),
        ...metadataPatch
      }
    })
    .eq("id", sourceFileId);
  if (error) {
    throw error;
  }
}

async function deleteReportRowsInBatches(
  supabase: ReturnType<typeof requireSupabaseAdmin>,
  table: string,
  reportId: string
) {
  while (true) {
    const selected = await supabase
      .from(table)
      .select("id")
      .eq("report_id", reportId)
      .limit(DELETE_BATCH_SIZE);

    if (selected.error) {
      if (isMissingRelationError(selected.error)) {
        return;
      }
      throw selected.error;
    }

    const ids = ((selected.data ?? []) as Array<{ id: string }>).map((row) => row.id);
    if (ids.length === 0) {
      return;
    }

    const deleted = await supabase.from(table).delete().in("id", ids);
    if (deleted.error) {
      if (isMissingRelationError(deleted.error)) {
        return;
      }
      throw deleted.error;
    }
  }
}

function isMissingRelationError(error: { code?: string; message?: string }) {
  return error.code === "42P01" || /does not exist|schema cache/i.test(error.message ?? "");
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function compactReportJson(result: ParserResult) {
  const report = result.normalized_report ?? {};
  return {
    schema_version: report.schema_version,
    report_id: report.report_id,
    report_status: report.report_status,
    source: report.source,
    period: report.period,
    currency: report.currency,
    financial_summary: report.financial_summary,
    allocations: Array.isArray(report.allocations) ? report.allocations : [],
    accounting_postings: Array.isArray(report.accounting_postings) ? report.accounting_postings : [],
    validation: report.validation,
    parser: report.parser,
    storage_policy: {
      compact_report_json: true,
      reason: "Detailed normalized records are stored in report_records to avoid large report JSON statement timeouts.",
      record_count: result.records.length,
      line_item_count: Array.isArray(report.line_items) ? report.line_items.length : 0,
      posting_count: Array.isArray(report.accounting_postings) ? report.accounting_postings.length : 0,
      provenance_count: result.field_provenance.length
    }
  };
}

function normalizeCurrency(value: unknown): string | null {
  if (!value || value === "UNKNOWN") {
    return null;
  }
  return String(value);
}

function normalizeSourceRole(value: string): string {
  if (["primary", "supporting", "verification", "duplicate", "allocation_model"].includes(value)) {
    return value;
  }
  return "primary";
}

function mediaTypeFromName(fileName: string): string {
  const suffix = fileName.toLowerCase().split(".").pop();
  switch (suffix) {
    case "xlsx":
      return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    case "csv":
      return "text/csv";
    case "pdf":
      return "application/pdf";
    case "docx":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    default:
      return "application/octet-stream";
  }
}
