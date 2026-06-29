import type { ReactNode } from "react";
import { ArrowLeft, CheckCircle2, Download, FileJson2, Send, ShieldAlert, Table2 } from "lucide-react";
import { AIRTABLE_COLUMNS, buildAirtableRows, numberOrNull } from "@/lib/airtableExport";
import { formatAmount } from "@/lib/format";
import { requireSupabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ reportId: string }>;
};

type PostingRecord = {
  id: string;
  report_id: string;
  record_key: string;
  status: string;
  normalized_json: Record<string, any>;
  amount: string | number | null;
  currency: string | null;
};

type ExportRecord = {
  report_id: string;
  report_record_id: string;
  record_key: string;
  status: string;
  customer: string | null;
  studio: string | null;
  amount: string | number | null;
  currency: string | null;
  memo: string | null;
  invoice_date: string | null;
  due_date: string | null;
  vertical: string | null;
  invoice_number: string | null;
};

export default async function ExportPreviewPage({ params }: PageProps) {
  const { reportId } = await params;
  const supabase = requireSupabaseAdmin();

  const [recordsResult, allPostingsResult, reconciliationResult, reportResult, failedValidationResult, openReviewResult] = await Promise.all([
    supabase.from("airtable_export_ready").select("*").eq("report_id", reportId),
    supabase
      .from("report_records")
      .select("id, report_id, record_key, status, normalized_json, amount, currency")
      .eq("report_id", reportId)
      .eq("record_type", "posting")
      .order("created_at", { ascending: true }),
    supabase.from("admin_report_reconciliation").select("*").eq("report_id", reportId).maybeSingle(),
    supabase.from("reports").select("report_key, invoice_date, due_date, period_end, status").eq("id", reportId).maybeSingle(),
    supabase.from("validation_results").select("id, check_name, message").eq("report_id", reportId).eq("status", "failed"),
    supabase
      .from("review_items")
      .select("id, reason")
      .eq("report_id", reportId)
      .in("status", ["open", "assigned", "corrected"])
  ]);

  if (recordsResult.error) {
    throw recordsResult.error;
  }
  if (allPostingsResult.error) {
    throw allPostingsResult.error;
  }
  if (reconciliationResult.error) {
    throw reconciliationResult.error;
  }
  if (reportResult.error) {
    throw reportResult.error;
  }
  if (failedValidationResult.error) {
    throw failedValidationResult.error;
  }
  if (openReviewResult.error) {
    throw openReviewResult.error;
  }

  const report = reportResult.data;
  const reconciliation = reconciliationResult.data;
  const defaultInvoiceDate = report?.invoice_date ?? report?.period_end ?? null;
  const readyRows = buildAirtableRows(recordsResult.data ?? [], {
    invoiceDate: defaultInvoiceDate,
    dueDate: report?.due_date ?? null
  });
  const readyRecordIds = new Set((recordsResult.data ?? []).map((record) => String(record.report_record_id)));
  const exportRecords = ((allPostingsResult.data ?? []) as PostingRecord[]).map(toExportRecord);
  const previewRows = buildAirtableRows(exportRecords, {
    invoiceDate: defaultInvoiceDate,
    dueDate: report?.due_date ?? null
  }).map((row, index) => {
    const record = exportRecords[index];
    return {
      ...row,
      recordStatus: record.status,
      gate: exportGate(record, {
        readyRecordIds,
        reportStatus: report?.status ?? null,
        failedValidations: failedValidationResult.data ?? [],
        openReviews: openReviewResult.data ?? []
      })
    };
  });
  const exportTotal = readyRows.reduce((sum, row) => sum + Number(row.csvFields.Amount ?? 0), 0);
  const previewTotal = previewRows.reduce((sum, row) => sum + Number(row.csvFields.Amount ?? 0), 0);
  const sourceTotal = numberOrNull(reconciliation?.source_total);
  const normalizedTotal = numberOrNull(reconciliation?.normalized_total);
  const sourceDiff = sourceTotal === null || normalizedTotal === null ? null : normalizedTotal - sourceTotal;
  const exportDiff = normalizedTotal === null ? null : exportTotal - normalizedTotal;
  const apiSendEnabled = process.env.AIRTABLE_ENABLE_API_SEND === "true";
  const canExport = readyRows.length > 0;
  const blockedRows = Math.max(0, previewRows.length - readyRows.length);
  const exportBalanced = exportDiff !== null && Math.abs(exportDiff) <= 0.01;

  return (
    <>
      <div className="topbar">
        <div>
          <h1>Airtable Preview</h1>
          <p>{report?.report_key ?? reportId}</p>
        </div>
        <div className="action-row">
          <a className="button secondary" href="/reports">
            <ArrowLeft size={16} aria-hidden="true" />
            Back
          </a>
          <form action={`/api/export/${reportId}`} method="post">
            <button className="button" type="submit" disabled={!canExport} title="Generate Airtable-compatible export">
              {apiSendEnabled ? <Send size={16} aria-hidden="true" /> : <Download size={16} aria-hidden="true" />}
              {apiSendEnabled ? "Send" : "Generate CSV"}
            </button>
          </form>
        </div>
      </div>

      {!canExport ? (
        <div className="setup setup-warning">
          <ShieldAlert size={17} aria-hidden="true" />
          <span>No ready postings are available for export. Parser candidate rows still appear below with the gate that prevents export.</span>
        </div>
      ) : null}

      <section className={`export-readiness ${canExport && exportBalanced ? "ready" : "blocked"}`} aria-label="Export readiness">
        <div>
          <span className="eyebrow">Airtable Export Gate</span>
          <strong>{canExport ? `${readyRows.length} row${readyRows.length === 1 ? "" : "s"} ready` : "Export blocked"}</strong>
        </div>
        <p>
          {canExport
            ? "Ready rows are eligible for CSV/API export. Candidate rows that fail validation or review gates are shown for accounting review only."
            : "The report has no export-ready posting records. Resolve review items, failed validations, or missing required fields before exporting."}
        </p>
      </section>

      <section className="grid stats" aria-label="Export totals">
        <Stat label="Candidate Rows" value={String(previewRows.length)} icon={<Table2 size={18} aria-hidden="true" />} />
        <Stat label="Ready Rows" value={String(readyRows.length)} tone={readyRows.length > 0 ? "ok" : "warning"} icon={<CheckCircle2 size={18} aria-hidden="true" />} />
        <Stat label="Blocked Rows" value={String(blockedRows)} tone={blockedRows > 0 ? "warning" : "ok"} icon={<ShieldAlert size={18} aria-hidden="true" />} />
        <Stat label="Source" value={formatAmount(sourceTotal, reconciliation?.currency)} />
        <Stat label="Normalized" value={formatAmount(normalizedTotal, reconciliation?.currency)} />
        <Stat label="Export" value={formatAmount(exportTotal, reconciliation?.currency)} />
        <Stat label="Preview Total" value={formatAmount(previewTotal, reconciliation?.currency)} />
        <Stat label="Export Diff" value={formatAmount(exportDiff, reconciliation?.currency)} tone={exportDiff !== null && Math.abs(exportDiff) > 0.01 ? "warning" : "ok"} />
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Airtable Row Preview</h2>
            <p className="subtle">Airtable-shaped parser output. Only rows marked ready are included in CSV/API export.</p>
          </div>
          <span className="preview-count">{previewRows.length} candidate rows</span>
        </div>
        <div className="preview-list">
          {previewRows.map((row) => (
            <article className="preview-card" key={row.source.report_record_id}>
              <div className="preview-card-header">
                <div>
                  <span className="preview-label">Airtable Record</span>
                  <strong>{row.csvFields.Customer || "Missing customer"}</strong>
                  <p>{row.csvFields.Memo || "Missing memo"}</p>
                </div>
                <div className="preview-card-actions">
                  <span className={`status ${row.recordStatus}`}>{row.recordStatus}</span>
                  <span className="amount-chip">{formatAmount(row.csvFields.Amount)}</span>
                </div>
              </div>
              <div className={`preview-gate ${row.gate === "Ready to export" ? "ready" : "blocked"}`}>
                {row.gate === "Ready to export" ? <CheckCircle2 size={15} aria-hidden="true" /> : <ShieldAlert size={15} aria-hidden="true" />}
                <span>{row.gate}</span>
              </div>
              <dl className="preview-fields airtable-fields">
                {AIRTABLE_COLUMNS.map((column) => (
                  <div className="preview-field" key={column}>
                    <dt>{column}</dt>
                    <dd>{row.csvFields[column] ?? ""}</dd>
                  </div>
                ))}
              </dl>
              <div className="source-strip">
                <FileJson2 size={14} aria-hidden="true" />
                <span className="code">{row.source.record_key}</span>
              </div>
            </article>
          ))}
          {previewRows.length === 0 ? <div className="empty">No parser posting records were produced for this report.</div> : null}
        </div>
      </section>
    </>
  );
}

function Stat({ label, value, tone, icon }: { label: string; value: string; tone?: "ok" | "warning"; icon?: ReactNode }) {
  return (
    <div className={`stat ${tone ? `stat-${tone}` : ""}`}>
      <span>
        {icon}
        {label}
      </span>
      <strong>{value}</strong>
    </div>
  );
}

function toExportRecord(record: PostingRecord): ExportRecord {
  const json = record.normalized_json ?? {};
  const amount = json.amount && typeof json.amount === "object" ? json.amount : {};
  return {
    report_id: record.report_id,
    report_record_id: record.id,
    record_key: record.record_key,
    status: record.status,
    customer: stringOrNull(json.customer),
    studio: stringOrNull(json.studio),
    amount: amount.amount ?? record.amount ?? null,
    currency: stringOrNull(amount.currency) ?? record.currency ?? null,
    memo: stringOrNull(json.memo),
    invoice_date: stringOrNull(json.invoice_date),
    due_date: stringOrNull(json.due_date),
    vertical: stringOrNull(json.vertical),
    invoice_number: stringOrNull(json.invoice_number)
  };
}

function exportGate(
  record: ExportRecord,
  context: {
    readyRecordIds: Set<string>;
    reportStatus: string | null;
    failedValidations: Array<{ check_name: string; message: string }>;
    openReviews: Array<{ reason: string }>;
  }
) {
  if (context.readyRecordIds.has(record.report_record_id)) {
    return "Ready to export";
  }

  const reasons = [];
  const exportableReportStatuses = new Set(["ready", "validated", "exported"]);
  if (!context.reportStatus || !exportableReportStatuses.has(context.reportStatus)) {
    reasons.push(`Report status is ${context.reportStatus ?? "missing"}`);
  }
  if (record.status !== "ready") {
    reasons.push(`Posting status is ${record.status}`);
  }
  if (context.failedValidations.length > 0) {
    reasons.push(`${context.failedValidations.length} failed validation check${context.failedValidations.length === 1 ? "" : "s"}`);
  }
  if (context.openReviews.length > 0) {
    reasons.push(`${context.openReviews.length} open review item${context.openReviews.length === 1 ? "" : "s"}`);
  }
  if (!record.customer) {
    reasons.push("Missing customer");
  }
  if (record.amount === null || record.amount === "") {
    reasons.push("Missing amount");
  }

  return reasons.join("; ") || "Not included by export-ready view";
}

function stringOrNull(value: unknown): string | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  return String(value);
}
