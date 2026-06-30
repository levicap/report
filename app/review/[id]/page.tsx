import type { ReactNode } from "react";
import { ArrowLeft, CheckCircle, FileJson2, ShieldAlert, Table2, XCircle } from "lucide-react";
import { notFound } from "next/navigation";
import { AIRTABLE_COLUMNS, buildAirtableRows, numberOrNull } from "@/lib/airtableExport";
import { formatAmount, formatDate } from "@/lib/format";
import { requireSupabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
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
  entered_at: string | null;
  exported_at: string | null;
  invoice_number: string | null;
};

type RecordComment = {
  id: string;
  report_record_id: string;
  comment_text: string;
  created_by: string | null;
  created_at: string;
};

type ValidationResult = {
  id: string;
  check_name: string;
  status: string;
  severity: string;
  message: string;
  declared_amount: string | number | null;
  computed_amount: string | number | null;
  difference_amount: string | number | null;
  tolerance_amount: string | number | null;
  currency: string | null;
  details: Record<string, unknown> | null;
  created_at: string;
};

export default async function ReviewDetailPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = requireSupabaseAdmin();

  const reviewResult = await supabase
    .from("review_items")
    .select(
      "id, report_id, report_record_id, validation_result_id, status, priority, reason, original_value, proposed_value, corrected_value, approval_notes, approved_at, created_at, reports(report_key, status, invoice_date, due_date, period_end, currency, normalized_report, platforms(display_name))"
    )
    .eq("id", id)
    .maybeSingle();

  if (reviewResult.error) {
    throw reviewResult.error;
  }
  if (!reviewResult.data) {
    notFound();
  }

  const review = reviewResult.data as any;
  const report = review.reports;
  const reportId = String(review.report_id);
  const defaultInvoiceDate = report?.invoice_date ?? report?.period_end ?? null;

  const [recordsResult, readyRecordsResult, validationResult, reconciliationResult, sourceFilesResult, provenanceResult, commentsResult] = await Promise.all([
    supabase
      .from("report_records")
      .select("id, report_id, record_key, status, normalized_json, amount, currency")
      .eq("report_id", reportId)
      .eq("record_type", "posting")
      .order("created_at", { ascending: true }),
    supabase.from("airtable_export_ready").select("*").eq("report_id", reportId),
    supabase
      .from("validation_results")
      .select("id, check_name, status, severity, message, declared_amount, computed_amount, difference_amount, tolerance_amount, currency, details, created_at")
      .eq("report_id", reportId)
      .order("created_at", { ascending: false }),
    supabase.from("admin_report_reconciliation").select("*").eq("report_id", reportId).maybeSingle(),
    supabase
      .from("report_source_files")
      .select("role, authoritative, source_locator, source_files(original_file_name, status, received_at, source_file_blobs(sha256, byte_size, media_type))")
      .eq("report_id", reportId),
    supabase
      .from("field_provenance")
      .select("id, field_path, value_json, source_sheet, source_page, source_row, source_column, source_cell_range, parser_family")
      .eq("report_id", reportId)
      .order("created_at", { ascending: true })
      .limit(80),
    supabase
      .from("record_comments")
      .select("id, report_record_id, comment_text, created_by, created_at")
      .eq("report_id", reportId)
      .order("created_at", { ascending: false })
  ]);

  if (recordsResult.error) throw recordsResult.error;
  if (readyRecordsResult.error) throw readyRecordsResult.error;
  if (validationResult.error) throw validationResult.error;
  if (reconciliationResult.error) throw reconciliationResult.error;
  if (sourceFilesResult.error) throw sourceFilesResult.error;
  if (provenanceResult.error) throw provenanceResult.error;
  if (commentsResult.error && !isMissingTableError(commentsResult.error)) throw commentsResult.error;

  const postingRecords = (recordsResult.data ?? []) as PostingRecord[];
  const exportRecords = postingRecords.map(toExportRecord);
  const readyRecordIds = new Set((readyRecordsResult.data ?? []).map((row: any) => String(row.report_record_id)));
  const commentsByRecordId = groupComments((commentsResult.error ? [] : commentsResult.data ?? []) as RecordComment[]);
  const previewRows = buildAirtableRows(exportRecords, {
    invoiceDate: defaultInvoiceDate,
    dueDate: report?.due_date ?? null
  }).map((row, index) => {
    const record = exportRecords[index];
    return {
      ...row,
      recordStatus: record.status,
      sourceCurrency: record.currency,
      comments: commentsByRecordId.get(record.report_record_id) ?? [],
      gate: readyRecordIds.has(record.report_record_id) ? "Ready to export" : exportGate(record, report?.status ?? null, (validationResult.data ?? []) as ValidationResult[])
    };
  });

  const validations = ((validationResult.data ?? []) as ValidationResult[]).sort(validationSort);
  const reconciliation = reconciliationResult.data as any;
  const exportTotal = previewRows
    .filter((row) => row.gate === "Ready to export")
    .reduce((sum, row) => sum + Number(row.csvFields.Amount ?? 0), 0);
  const previewTotal = previewRows.reduce((sum, row) => sum + Number(row.csvFields.Amount ?? 0), 0);
  const sourceTotal = numberOrNull(reconciliation?.source_total);
  const normalizedTotal = numberOrNull(reconciliation?.normalized_total);
  const exportDiff = normalizedTotal === null ? null : exportTotal - normalizedTotal;

  return (
    <>
      <div className="topbar">
        <div>
          <h1>Review Detail</h1>
          <p>{report?.report_key ?? reportId}</p>
        </div>
        <div className="action-row">
          <a className="button secondary" href="/review">
            <ArrowLeft size={16} aria-hidden="true" />
            Back
          </a>
          <form action={`/api/review/${review.id}/approve`} method="post">
            <button className="button secondary" type="submit">
              <CheckCircle size={15} aria-hidden="true" />
              Approve
            </button>
          </form>
          <form action={`/api/review/${review.id}/reject`} method="post">
            <button className="button secondary" type="submit">
              <XCircle size={15} aria-hidden="true" />
              Decline
            </button>
          </form>
        </div>
      </div>

      <section className="detail-grid">
        <div className="panel detail-panel">
          <div className="panel-header">
            <h2>Review Item</h2>
            <span className={`status ${review.status}`}>{review.status}</span>
          </div>
          <dl className="metadata-list">
            <Meta label="Priority" value={String(review.priority)} />
            <Meta label="Reason" value={review.reason} />
            <Meta label="Created" value={formatDate(review.created_at)} />
            <Meta label="Report status" value={report?.status ?? "Missing"} />
            <Meta label="Platform" value={report?.platforms?.display_name ?? "Unknown"} />
          </dl>
        </div>

        <div className="panel detail-panel">
          <div className="panel-header">
            <h2>Reconciliation</h2>
            <ShieldAlert size={17} aria-hidden="true" />
          </div>
          <dl className="metadata-list">
            <Meta label="Source total" value={formatAmount(sourceTotal, reconciliation?.currency)} />
            <Meta label="Normalized total" value={formatAmount(normalizedTotal, reconciliation?.currency)} />
            <Meta label="Preview total" value={formatAmount(previewTotal, reconciliation?.currency)} />
            <Meta label="Ready export total" value={formatAmount(exportTotal, reconciliation?.currency)} />
            <Meta label="Export diff" value={formatAmount(exportDiff, reconciliation?.currency)} />
          </dl>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Airtable Preview</h2>
            <p className="subtle">Candidate Airtable rows for this report. Rows with failed gates are not export-ready.</p>
          </div>
          <span className="preview-count">{previewRows.length} rows</span>
        </div>
        <div className="table-wrap">
          <table className="dense-table">
            <thead>
              <tr>
                <th>Gate</th>
                {AIRTABLE_COLUMNS.map((column) => (
                  <th key={column}>{column}</th>
                ))}
                <th>Comments</th>
              </tr>
            </thead>
            <tbody>
              {previewRows.map((row) => (
                <tr key={row.source.report_record_id} className={row.gate === "Ready to export" ? "" : "blocked-row"}>
                  <td>
                    <span className={`status ${row.gate === "Ready to export" ? "ready" : "blocked"}`}>{row.gate === "Ready to export" ? "ready" : "blocked"}</span>
                    <span className="row-subtext">{row.gate}</span>
                  </td>
                  {AIRTABLE_COLUMNS.map((column) => (
                    <td key={column}>{String(row.csvFields[column] ?? "") || "Missing"}</td>
                  ))}
                  <td>
                    {row.comments.length > 0 ? (
                      row.comments.map((comment) => (
                        <p className="table-comment" key={comment.id}>
                          <strong>{comment.created_by || "dashboard"}:</strong> {comment.comment_text}
                        </p>
                      ))
                    ) : (
                      <span className="row-subtext">No comments</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {previewRows.length === 0 ? <div className="empty">No Airtable candidate rows were produced for this report.</div> : null}
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Issues And Messages</h2>
          <span className="preview-count">{validations.length} checks</span>
        </div>
        <div className="issue-list">
          <article className="issue-item">
            <div>
              <span className={`status ${review.status}`}>review</span>
              <strong>{review.reason}</strong>
            </div>
            <p>Review item created from parser validation or classification uncertainty.</p>
          </article>
          {validations.map((validation) => (
            <article className="issue-item" key={validation.id}>
              <div>
                <span className={`status ${validation.status}`}>{validation.status}</span>
                <strong>{validation.check_name}</strong>
              </div>
              <p>{validation.message}</p>
              <dl className="inline-metadata">
                <Meta label="Declared" value={formatAmount(validation.declared_amount, validation.currency)} />
                <Meta label="Computed" value={formatAmount(validation.computed_amount, validation.currency)} />
                <Meta label="Difference" value={formatAmount(validation.difference_amount, validation.currency)} />
                <Meta label="Tolerance" value={formatAmount(validation.tolerance_amount, validation.currency)} />
              </dl>
            </article>
          ))}
        </div>
      </section>

      <section className="detail-grid">
        <div className="panel detail-panel">
          <div className="panel-header">
            <h2>Source Files</h2>
          </div>
          <div className="source-file-list">
            {((sourceFilesResult.data ?? []) as any[]).map((source, index) => {
              const file = nestedSource(source.source_files);
              const blob = nestedSource(file?.source_file_blobs);
              return (
                <article className="source-file-card" key={`${file?.original_file_name ?? index}-${source.role}`}>
                  <strong>{file?.original_file_name ?? "Missing file name"}</strong>
                  <span>{source.role}{source.authoritative ? " / authoritative" : ""}</span>
                  <span className="code">{blob?.sha256 ?? "Missing hash"}</span>
                </article>
              );
            })}
            {(sourceFilesResult.data ?? []).length === 0 ? <div className="empty">No source files linked to this report.</div> : null}
          </div>
        </div>

        <div className="panel detail-panel">
          <div className="panel-header">
            <h2>Source Locations</h2>
          </div>
          <div className="provenance-list">
            {((provenanceResult.data ?? []) as any[]).slice(0, 30).map((item) => (
              <div className="provenance-item" key={item.id}>
                <FileJson2 size={14} aria-hidden="true" />
                <span className="code">{item.field_path}</span>
                <span>
                  {item.source_sheet || "sheet?"} row {item.source_row ?? "?"} col {item.source_column ?? "?"}
                </span>
              </div>
            ))}
            {(provenanceResult.data ?? []).length === 0 ? <div className="empty">No provenance rows found.</div> : null}
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Review Payload</h2>
        </div>
        <div className="json-grid">
          <JsonBlock title="Original" value={review.original_value} />
          <JsonBlock title="Proposed" value={review.proposed_value} />
          <JsonBlock title="Corrected" value={review.corrected_value} />
        </div>
      </section>
    </>
  );
}

function Meta({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function JsonBlock({ title, value }: { title: string; value: unknown }) {
  return (
    <article className="json-block">
      <strong>{title}</strong>
      <pre>{value ? JSON.stringify(value, null, 2) : "Missing"}</pre>
    </article>
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
    entered_at: stringOrNull(json.entered_at),
    exported_at: stringOrNull(json.exported_at),
    invoice_number: stringOrNull(json.invoice_number)
  };
}

function exportGate(record: ExportRecord, reportStatus: string | null, validations: ValidationResult[]) {
  const reasons = [];
  if (!["ready", "validated", "exported"].includes(reportStatus ?? "")) {
    reasons.push(`Report status is ${reportStatus ?? "missing"}`);
  }
  if (record.status !== "ready") {
    reasons.push(`Posting status is ${record.status}`);
  }
  if (validations.some((validation) => validation.status === "failed")) {
    reasons.push("Failed validation exists");
  }
  if (!record.customer) {
    reasons.push("Missing customer");
  }
  if (record.amount === null || record.amount === "") {
    reasons.push("Missing amount");
  }
  return reasons.join("; ") || "Blocked by export-ready view";
}

function groupComments(comments: RecordComment[]) {
  const grouped = new Map<string, RecordComment[]>();
  for (const comment of comments) {
    const existing = grouped.get(comment.report_record_id) ?? [];
    existing.push(comment);
    grouped.set(comment.report_record_id, existing);
  }
  return grouped;
}

function validationSort(a: ValidationResult, b: ValidationResult) {
  const score = (value: string) => {
    if (value === "failed") return 0;
    if (value === "warning") return 1;
    return 2;
  };
  return score(a.status) - score(b.status);
}

function nestedSource(value: unknown): any {
  return Array.isArray(value) ? value[0] : value;
}

function stringOrNull(value: unknown): string | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  return String(value);
}

function isMissingTableError(error: { code?: string; message?: string }) {
  return error.code === "42P01" || /record_comments/i.test(error.message ?? "");
}
