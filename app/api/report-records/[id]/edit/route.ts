import { NextResponse } from "next/server";
import { requireSupabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_STATUSES = new Set(["ready", "review", "blocked", "suppressed"]);

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const formData = await request.formData();
  const supabase = requireSupabaseAdmin();

  const { data: record, error: recordError } = await supabase
    .from("report_records")
    .select("id, report_id, status, normalized_json, currency")
    .eq("id", id)
    .maybeSingle();

  if (recordError) {
    return NextResponse.json({ error: recordError.message }, { status: 500 });
  }
  if (!record) {
    return NextResponse.json({ error: "Report record not found." }, { status: 404 });
  }

  const currentJson = isObject(record.normalized_json) ? record.normalized_json : {};
  const currentAmount = isObject(currentJson.amount) ? currentJson.amount : {};
  const currency = (text(formData.get("currency")) || String(currentAmount.currency ?? record.currency ?? "USD")).toUpperCase();
  const amountText = text(formData.get("amount"));
  const amountNumber = parseAmount(amountText);

  if (amountText && amountNumber === null) {
    return NextResponse.json({ error: "Amount must be numeric." }, { status: 400 });
  }

  const nextStatus = text(formData.get("record_status"));
  const status = VALID_STATUSES.has(nextStatus) ? nextStatus : record.status;
  const editedAt = new Date().toISOString();
  const updatedJson = {
    ...currentJson,
    customer: text(formData.get("customer")),
    studio: text(formData.get("studio")),
    amount: {
      ...currentAmount,
      amount: amountNumber === null ? null : String(amountNumber),
      currency
    },
    memo: text(formData.get("memo")),
    invoice_date: text(formData.get("invoice_date")) || null,
    due_date: text(formData.get("due_date")) || null,
    vertical: text(formData.get("vertical")),
    entered_at: text(formData.get("entered_at")) || null,
    exported_at: text(formData.get("exported_at")) || null,
    invoice_number: text(formData.get("invoice_number")) || null,
    manual_edit: {
      ...(isObject(currentJson.manual_edit) ? currentJson.manual_edit : {}),
      edited_at: editedAt,
      edited_from: "airtable_preview"
    }
  };

  const { error: updateError } = await supabase
    .from("report_records")
    .update({
      normalized_json: updatedJson,
      amount: amountNumber,
      currency,
      status
    })
    .eq("id", id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  const comment = text(formData.get("comment"));
  if (comment) {
    const { error: commentError } = await supabase.from("record_comments").insert({
      report_id: record.report_id,
      report_record_id: id,
      comment_text: comment,
      created_by: text(formData.get("created_by")) || "dashboard"
    });

    if (commentError) {
      return NextResponse.json({ error: commentError.message }, { status: 500 });
    }
  }

  return NextResponse.redirect(new URL(`/reports/${record.report_id}/export-preview#record-${id}`, request.url), { status: 303 });
}

function text(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value.trim() : "";
}

function parseAmount(value: string): number | null {
  if (!value) {
    return null;
  }
  const numeric = Number(value.replace(/,/g, ""));
  return Number.isFinite(numeric) ? numeric : null;
}

function isObject(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
