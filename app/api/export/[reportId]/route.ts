import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { buildAirtableRows, numberOrNull, safeFileName, toCsv } from "@/lib/airtableExport";
import { requireSupabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ reportId: string }> }) {
  const { reportId } = await context.params;
  const supabase = requireSupabaseAdmin();

  const { data: records, error: recordsError } = await supabase
    .from("airtable_export_ready")
    .select("*")
    .eq("report_id", reportId);

  if (recordsError) {
    return NextResponse.json({ error: recordsError.message }, { status: 500 });
  }

  if (!records || records.length === 0) {
    return NextResponse.json({ error: "No ready postings are available for this report." }, { status: 409 });
  }

  const { data: reconciliation } = await supabase
    .from("admin_report_reconciliation")
    .select("source_total, normalized_total, currency")
    .eq("report_id", reportId)
    .maybeSingle();

  const { data: reportDefaults, error: reportDefaultsError } = await supabase
    .from("reports")
    .select("invoice_date, due_date, period_end")
    .eq("id", reportId)
    .maybeSingle();

  if (reportDefaultsError) {
    return NextResponse.json({ error: reportDefaultsError.message }, { status: 500 });
  }

  const generatedAt = new Date().toISOString();
  const defaultInvoiceDate = reportDefaults?.invoice_date ?? reportDefaults?.period_end ?? null;
  const airtableRows = buildAirtableRows(records, {
    invoiceDate: defaultInvoiceDate,
    dueDate: reportDefaults?.due_date ?? null
  });
  const payload = {
    destination: "airtable",
    records: airtableRows.map((row) => ({
      fields: row.apiFields,
      source: row.source
    }))
  };

  const total = airtableRows.reduce((sum, row) => sum + Number(row.csvFields.Amount ?? 0), 0);
  const idempotencyKey = crypto
    .createHash("sha256")
    .update(JSON.stringify({ reportId, ids: records.map((record) => record.report_record_id), total, fields: airtableRows.map((row) => row.csvFields) }))
    .digest("hex");

  const airtableConfig = getAirtableConfig();
  const existingExport = await supabase
    .from("exports")
    .select("id, status, destination_response, sent_at, accepted_at, error_message")
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();

  let destinationResponse: Record<string, unknown> | null = null;
  let exportStatus = "generated";
  let sentAt: string | null = null;
  let acceptedAt: string | null = null;
  let errorMessage: string | null = null;

  if (airtableConfig && existingExport.data?.status !== "accepted") {
    const sendResult = await sendToAirtable(airtableConfig, airtableRows.map((row) => row.apiFields));
    destinationResponse = sendResult.response;
    sentAt = generatedAt;
    if (sendResult.ok) {
      exportStatus = "accepted";
      acceptedAt = new Date().toISOString();
    } else {
      exportStatus = "failed";
      errorMessage = sendResult.error;
    }
  } else if (existingExport.data?.status === "accepted") {
    exportStatus = "accepted";
    destinationResponse = existingExport.data.destination_response as Record<string, unknown> | null;
    sentAt = existingExport.data.sent_at;
    acceptedAt = existingExport.data.accepted_at;
    errorMessage = existingExport.data.error_message;
  }

  const sourceTotal = numberOrNull(reconciliation?.source_total);
  const normalizedTotal = numberOrNull(reconciliation?.normalized_total) ?? total;
  const currency = records[0]?.currency ?? reconciliation?.currency ?? null;
  const { error: exportError } = await supabase.from("exports").upsert(
    {
      report_id: reportId,
      destination: "airtable",
      destination_base_id: airtableConfig?.baseId ?? null,
      destination_table: airtableConfig?.tableName ?? "Data Entry",
      export_format: airtableConfig ? "airtable_api" : "airtable_csv",
      status: exportStatus,
      idempotency_key: idempotencyKey,
      record_count: records.length,
      source_total: sourceTotal,
      normalized_total: normalizedTotal,
      export_total: total,
      currency,
      difference_source_normalized: sourceTotal === null ? null : normalizedTotal - sourceTotal,
      difference_normalized_export: total - normalizedTotal,
      payload,
      destination_response: destinationResponse,
      sent_at: sentAt,
      accepted_at: acceptedAt,
      error_message: errorMessage
    },
    { onConflict: "idempotency_key" }
  );

  if (exportError) {
    return NextResponse.json({ error: exportError.message }, { status: 500 });
  }

  await supabase.from("reconciliation_snapshots").insert({
    report_id: reportId,
    stage: "export",
    amount: total,
    currency,
    record_count: records.length,
    validation_status: errorMessage ? "failed" : "passed",
    tolerance_amount: "0.01",
    details: { generated_export_idempotency_key: idempotencyKey }
  });

  if (errorMessage) {
    return NextResponse.json({ error: errorMessage, response: destinationResponse }, { status: 502 });
  }

  if (airtableConfig) {
    return NextResponse.redirect(new URL("/reports?export=sent", request.url), { status: 303 });
  }

  return new Response(toCsv(airtableRows.map((row) => row.csvFields)), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${safeFileName(records[0]?.report_key ?? reportId)}-airtable.csv"`
    }
  });
}

type AirtableConfig = {
  apiKey: string;
  baseId: string;
  tableName: string;
};

function getAirtableConfig(): AirtableConfig | null {
  if (process.env.AIRTABLE_ENABLE_API_SEND !== "true") {
    return null;
  }
  const apiKey = process.env.AIRTABLE_API_KEY;
  const baseId = process.env.AIRTABLE_BASE_ID;
  const tableName = process.env.AIRTABLE_TABLE_NAME;
  if (!apiKey || !baseId || !tableName) {
    return null;
  }
  return { apiKey, baseId, tableName };
}

async function sendToAirtable(config: AirtableConfig, fields: Array<Record<string, string | number>>) {
  const url = `https://api.airtable.com/v0/${encodeURIComponent(config.baseId)}/${encodeURIComponent(config.tableName)}`;
  const batches = [];
  for (let index = 0; index < fields.length; index += 10) {
    batches.push(fields.slice(index, index + 10));
  }

  const responses: Array<Record<string, unknown>> = [];
  for (const batch of batches) {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        records: batch.map((item) => ({ fields: item })),
        typecast: true
      })
    });
    const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    responses.push({ status: response.status, ok: response.ok, body });
    if (!response.ok) {
      return {
        ok: false,
        response: { batches: responses },
        error: `Airtable API rejected export with status ${response.status}.`
      };
    }
  }

  return {
    ok: true,
    response: { batches: responses },
    error: null
  };
}
