import type { ReactNode } from "react";
import { ArrowLeft, CheckCircle2, Download, FileJson2, MessageSquare, Save, Send, ShieldAlert, Table2 } from "lucide-react";
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

export default async function ExportPreviewPage({ params }: PageProps) {
  const { reportId } = await params;
  const supabase = requireSupabaseAdmin();

  const [recordsResult, allPostingsResult, reconciliationResult, reportResult, failedValidationResult, openReviewResult, commentsResult] = await Promise.all([
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
      .in("status", ["open", "assigned", "corrected"]),
    supabase
      .from("record_comments")
      .select("id, report_record_id, comment_text, created_by, created_at")
      .eq("report_id", reportId)
      .order("created_at", { ascending: false })
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
  if (commentsResult.error && !isMissingTableError(commentsResult.error)) {
    throw commentsResult.error;
  }

  const report = reportResult.data;
  const reconciliation = reconciliationResult.data;
  const defaultInvoiceDate = report?.invoice_date ?? report?.period_end ?? null;
  const readyRows = buildAirtableRows(recordsResult.data ?? [], {
    invoiceDate: defaultInvoiceDate,
    dueDate: report?.due_date ?? null
  });
  const failedValidations = failedValidationResult.data ?? [];
  const openReviews = openReviewResult.data ?? [];
  const readyRecordIds = new Set((recordsResult.data ?? []).map((record) => String(record.report_record_id)));
  const exportRecords = ((allPostingsResult.data ?? []) as PostingRecord[]).map(toExportRecord);
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
      gate: exportGate(record, {
        readyRecordIds,
        reportStatus: report?.status ?? null,
        failedValidations,
        openReviews
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
    <div className="space-y-6">
      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-sm dark:border-gray-800 dark:bg-white/[0.03] md:p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <a
              className="mb-4 inline-flex w-fit items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-theme-sm font-medium text-gray-700 shadow-theme-xs hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
              href="/reports"
            >
              <ArrowLeft size={16} aria-hidden="true" />
              Back to reports
            </a>
            <p className="mb-2 text-theme-sm font-medium text-brand-500">Airtable Export Preview</p>
            <h1 className="max-w-5xl break-words text-2xl font-semibold text-gray-800 dark:text-white/90">{report?.report_key ?? reportId}</h1>
            <p className="mt-2 max-w-4xl text-theme-sm text-gray-500 dark:text-gray-400">
              Review the exact Airtable-shaped records before export. Edit fields and add comments from the collapsed row panels below.
            </p>
          </div>
          <div className="flex shrink-0 flex-col gap-3 sm:flex-row xl:items-center">
            <ReadinessBadge ready={canExport && exportBalanced} label={canExport ? `${readyRows.length} ready` : "Blocked"} />
            <form action={`/api/export/${reportId}`} method="post">
              <button
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-brand-500 px-4 text-theme-sm font-medium text-white shadow-theme-xs hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                type="submit"
                disabled={!canExport}
                title="Generate Airtable-compatible export"
              >
                {apiSendEnabled ? <Send size={16} aria-hidden="true" /> : <Download size={16} aria-hidden="true" />}
                {apiSendEnabled ? "Send to Airtable" : "Generate CSV"}
              </button>
            </form>
          </div>
        </div>
      </section>

      {!canExport ? (
        <div className="flex items-start gap-3 rounded-xl border border-warning-200 bg-warning-50 px-4 py-3 text-theme-sm font-medium text-warning-700">
          <ShieldAlert className="mt-0.5 shrink-0" size={17} aria-hidden="true" />
          <span>No ready postings are available for export. Candidate records are still shown below with the gate reason that prevents export.</span>
        </div>
      ) : null}

      <section
        className={`rounded-2xl border p-5 shadow-theme-sm ${
          canExport && exportBalanced
            ? "border-success-200 bg-success-50 dark:border-success-500/20 dark:bg-success-500/[0.08]"
            : "border-warning-200 bg-warning-50 dark:border-warning-500/20 dark:bg-warning-500/[0.08]"
        }`}
        aria-label="Export readiness"
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <span className="text-theme-sm font-medium text-gray-600 dark:text-gray-300">Export gate</span>
            <strong className="mt-1 block text-lg font-semibold text-gray-800 dark:text-white/90">
              {canExport ? `${readyRows.length} row${readyRows.length === 1 ? "" : "s"} ready for export` : "Export blocked"}
            </strong>
          </div>
          <p className="max-w-4xl text-theme-sm text-gray-600 dark:text-gray-300">
            {canExport
              ? "Ready rows are included in CSV/API export. Blocked candidate rows stay visible for accounting review and correction."
              : "Resolve review items, failed validations, missing required fields, or posting statuses before exporting."}
          </p>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Export totals">
        <Stat label="Candidate Rows" value={String(previewRows.length)} icon={<Table2 size={18} aria-hidden="true" />} />
        <Stat label="Ready Rows" value={String(readyRows.length)} tone={readyRows.length > 0 ? "ok" : "warning"} icon={<CheckCircle2 size={18} aria-hidden="true" />} />
        <Stat label="Blocked Rows" value={String(blockedRows)} tone={blockedRows > 0 ? "warning" : "ok"} icon={<ShieldAlert size={18} aria-hidden="true" />} />
        <Stat label="Preview Total" value={formatAmount(previewTotal, reconciliation?.currency)} />
        <Stat label="Source Total" value={formatAmount(sourceTotal, reconciliation?.currency)} />
        <Stat label="Normalized" value={formatAmount(normalizedTotal, reconciliation?.currency)} />
        <Stat label="Source Diff" value={formatAmount(sourceDiff, reconciliation?.currency)} tone={sourceDiff !== null && Math.abs(sourceDiff) > 0.01 ? "warning" : "ok"} />
        <Stat label="Export Diff" value={formatAmount(exportDiff, reconciliation?.currency)} tone={exportDiff !== null && Math.abs(exportDiff) > 0.01 ? "warning" : "ok"} />
      </section>

      {(failedValidations.length > 0 || openReviews.length > 0) && (
        <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {failedValidations.length > 0 ? (
            <IssuePanel title="Failed Validations" count={failedValidations.length}>
              {failedValidations.slice(0, 6).map((item) => (
                <li className="rounded-lg border border-error-200 bg-error-50 px-3 py-2 text-theme-sm text-error-700" key={item.id}>
                  <strong className="block font-medium">{item.check_name}</strong>
                  <span>{item.message}</span>
                </li>
              ))}
            </IssuePanel>
          ) : null}
          {openReviews.length > 0 ? (
            <IssuePanel title="Open Review Items" count={openReviews.length}>
              {openReviews.slice(0, 6).map((item) => (
                <li className="rounded-lg border border-warning-200 bg-warning-50 px-3 py-2 text-theme-sm text-warning-700" key={item.id}>
                  {item.reason}
                </li>
              ))}
            </IssuePanel>
          ) : null}
        </section>
      )}

      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-sm dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="flex flex-col gap-3 border-b border-gray-200 px-5 py-4 dark:border-gray-800 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">Airtable Records</h2>
            <p className="mt-1 text-theme-sm text-gray-500 dark:text-gray-400">
              Compact preview of the rows that will be exported or held for review.
            </p>
          </div>
          <span className="inline-flex w-fit rounded-full bg-gray-100 px-3 py-1 text-theme-xs font-medium text-gray-600 dark:bg-white/[0.05] dark:text-gray-300">
            {previewRows.length} candidate rows
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-[1180px]">
            <thead>
              <tr>
                <th className="px-4 py-3">Record</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Studio</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Memo</th>
                <th className="px-4 py-3">Invoice</th>
                <th className="px-4 py-3">Due</th>
                <th className="px-4 py-3">Vertical</th>
                <th className="px-4 py-3">Gate</th>
                <th className="px-4 py-3">Edit</th>
              </tr>
            </thead>
            <tbody>
              {previewRows.map((row) => (
                <tr className="hover:bg-gray-50/70 dark:hover:bg-white/[0.02]" key={row.source.report_record_id}>
                  <td className="max-w-[170px] px-4 py-3">
                    <span className="block truncate font-mono text-theme-xs text-gray-500" title={row.source.record_key}>
                      {row.source.record_key}
                    </span>
                    <StatusBadge status={row.recordStatus} />
                  </td>
                  <td className="max-w-[170px] px-4 py-3">
                    <CellValue value={row.csvFields.Customer} />
                  </td>
                  <td className="max-w-[170px] px-4 py-3">
                    <CellValue value={row.csvFields.Studio} />
                  </td>
                  <td className="px-4 py-3 font-semibold text-gray-800 dark:text-white/90">
                    {formatAmount(row.csvFields.Amount, row.sourceCurrency)}
                  </td>
                  <td className="max-w-[260px] px-4 py-3">
                    <CellValue value={row.csvFields.Memo} />
                  </td>
                  <td className="px-4 py-3">
                    <CellValue value={row.csvFields["Invoice Date"]} />
                  </td>
                  <td className="px-4 py-3">
                    <CellValue value={row.csvFields["Due Date"]} />
                  </td>
                  <td className="max-w-[130px] px-4 py-3">
                    <CellValue value={row.csvFields.Vertical} />
                  </td>
                  <td className="max-w-[260px] px-4 py-3">
                    <GateBadge gate={row.gate} />
                  </td>
                  <td className="px-4 py-3">
                    <a
                      className="inline-flex h-9 items-center justify-center rounded-lg border border-gray-300 bg-white px-3 text-theme-sm font-medium text-gray-700 shadow-theme-xs hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
                      href={`#record-${row.source.report_record_id}`}
                    >
                      Edit row
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {previewRows.length === 0 ? (
            <div className="px-5 py-12 text-center text-theme-sm text-gray-500 dark:text-gray-400">
              No parser posting records were produced for this report.
            </div>
          ) : null}
        </div>
      </section>

      {previewRows.length > 0 ? (
        <section className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">Edit Records and Comments</h2>
            <p className="mt-1 text-theme-sm text-gray-500 dark:text-gray-400">
              Open a row only when you need to change Airtable fields, adjust status, or leave an accounting note.
            </p>
          </div>

          {previewRows.map((row, index) => (
            <details
              className="group rounded-2xl border border-gray-200 bg-white shadow-theme-sm dark:border-gray-800 dark:bg-white/[0.03]"
              id={`record-${row.source.report_record_id}`}
              key={row.source.report_record_id}
              open={index === 0 && !canExport}
            >
              <summary className="flex cursor-pointer list-none flex-col gap-3 px-5 py-4 marker:hidden lg:flex-row lg:items-center lg:justify-between [&::-webkit-details-marker]:hidden">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <strong className="text-theme-sm font-semibold text-gray-800 dark:text-white/90">
                      {row.csvFields.Customer || "Missing customer"}
                    </strong>
                    <StatusBadge status={row.recordStatus} />
                    <GateBadge gate={row.gate} compact />
                  </div>
                  <p className="mt-1 max-w-5xl truncate text-theme-sm text-gray-500 dark:text-gray-400">
                    {row.csvFields.Memo || "Missing memo"}
                  </p>
                  <span className="mt-1 block truncate font-mono text-theme-xs text-gray-500">{row.source.record_key}</span>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="rounded-full bg-gray-100 px-3 py-1 text-theme-sm font-semibold text-gray-800 dark:bg-white/[0.05] dark:text-white/90">
                    {formatAmount(row.csvFields.Amount, row.sourceCurrency)}
                  </span>
                  <span className="text-theme-xs font-medium text-brand-500 group-open:hidden">Open</span>
                  <span className="hidden text-theme-xs font-medium text-brand-500 group-open:inline">Close</span>
                </div>
              </summary>

              <form action={`/api/report-records/${row.source.report_record_id}/edit`} method="post" className="border-t border-gray-200 px-5 py-5 dark:border-gray-800">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                  {AIRTABLE_COLUMNS.map((column) => {
                    const field = fieldForColumn(column);
                    return (
                      <FieldControl
                        defaultValue={String(row.csvFields[column] ?? "")}
                        inputMode={field.inputMode}
                        key={column}
                        label={column}
                        name={field.name}
                        type={field.type}
                      />
                    );
                  })}
                  <FieldControl defaultValue={String(row.sourceCurrency ?? "")} label="Currency" maxLength={3} name="currency" type="text" />
                  <label className="block">
                    <span className="mb-1.5 block text-theme-xs font-medium uppercase text-gray-500 dark:text-gray-400">Status</span>
                    <select
                      className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-theme-sm text-gray-800 shadow-theme-xs outline-none focus:border-brand-300 focus:shadow-focus-ring dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
                      name="record_status"
                      defaultValue={row.recordStatus}
                    >
                      <option value="ready">ready</option>
                      <option value="review">review</option>
                      <option value="blocked">blocked</option>
                      <option value="suppressed">suppressed</option>
                    </select>
                  </label>
                </div>

                <div className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(320px,420px)]">
                  <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-white/[0.03]">
                    <div className="mb-3 flex items-center gap-2 text-theme-sm font-semibold text-gray-800 dark:text-white/90">
                      <MessageSquare size={15} aria-hidden="true" />
                      Comments
                    </div>
                    {row.comments.length > 0 ? (
                      <div className="space-y-2">
                        {row.comments.map((comment) => (
                          <p className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-theme-sm text-gray-600 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300" key={comment.id}>
                            <span className="mr-2 font-medium text-gray-800 dark:text-white/90">{comment.created_by || "dashboard"}</span>
                            {comment.comment_text}
                          </p>
                        ))}
                      </div>
                    ) : (
                      <p className="text-theme-sm text-gray-500 dark:text-gray-400">No comments yet.</p>
                    )}
                  </div>

                  <label className="block">
                    <span className="mb-1.5 flex items-center gap-2 text-theme-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                      <MessageSquare size={14} aria-hidden="true" />
                      Add comment
                    </span>
                    <textarea
                      className="min-h-[126px] w-full resize-y rounded-lg border border-gray-300 bg-white px-3 py-2 text-theme-sm text-gray-800 shadow-theme-xs outline-none placeholder:text-gray-400 focus:border-brand-300 focus:shadow-focus-ring dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
                      name="comment"
                      placeholder="Add record comment"
                    />
                  </label>
                </div>

                <div className="mt-5 flex flex-col gap-3 border-t border-gray-200 pt-4 dark:border-gray-800 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-center gap-2 text-theme-xs text-gray-500 dark:text-gray-400">
                    <FileJson2 className="shrink-0" size={14} aria-hidden="true" />
                    <span className="truncate font-mono">{row.source.record_key}</span>
                  </div>
                  <button
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 text-theme-sm font-medium text-gray-700 shadow-theme-xs hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
                    type="submit"
                    title="Save Airtable record edits"
                  >
                    <Save size={15} aria-hidden="true" />
                    Save row
                  </button>
                </div>
              </form>
            </details>
          ))}
        </section>
      ) : null}
    </div>
  );
}

function Stat({ label, value, tone, icon }: { label: string; value: string; tone?: "ok" | "warning"; icon?: ReactNode }) {
  const iconClass =
    tone === "warning"
      ? "bg-warning-50 text-warning-600 dark:bg-warning-500/[0.12]"
      : tone === "ok"
        ? "bg-success-50 text-success-600 dark:bg-success-500/[0.12]"
        : "bg-brand-50 text-brand-500 dark:bg-brand-500/[0.12]";

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-sm dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="flex items-center gap-3">
        {icon ? <span className={`inline-flex size-10 items-center justify-center rounded-xl ${iconClass}`}>{icon}</span> : null}
        <span className="text-theme-sm font-medium text-gray-500 dark:text-gray-400">{label}</span>
      </div>
      <strong className="mt-4 block text-xl font-semibold text-gray-800 dark:text-white/90">{value}</strong>
    </div>
  );
}

function ReadinessBadge({ ready, label }: { ready: boolean; label: string }) {
  return (
    <span
      className={`inline-flex h-11 items-center justify-center gap-2 rounded-lg px-4 text-theme-sm font-medium ${
        ready
          ? "bg-success-50 text-success-700 dark:bg-success-500/[0.12] dark:text-success-500"
          : "bg-warning-50 text-warning-700 dark:bg-warning-500/[0.12] dark:text-warning-500"
      }`}
    >
      {ready ? <CheckCircle2 size={16} aria-hidden="true" /> : <ShieldAlert size={16} aria-hidden="true" />}
      {label}
    </span>
  );
}

function IssuePanel({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-sm dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">{title}</h2>
        <span className="inline-flex rounded-full bg-gray-100 px-3 py-1 text-theme-xs font-medium text-gray-600 dark:bg-white/[0.05] dark:text-gray-300">
          {count}
        </span>
      </div>
      <ul className="space-y-2">{children}</ul>
    </section>
  );
}

function CellValue({ value }: { value: string | number | null }) {
  if (value === null || value === "") {
    return <span className="text-gray-400">Missing</span>;
  }

  return (
    <span className="block truncate text-theme-sm text-gray-700 dark:text-gray-300" title={String(value)}>
      {String(value)}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const tone = statusTone(status);
  const className =
    tone === "success"
      ? "bg-success-50 text-success-700 dark:bg-success-500/[0.12] dark:text-success-500"
      : tone === "error"
        ? "bg-error-50 text-error-700 dark:bg-error-500/[0.12] dark:text-error-500"
        : "bg-warning-50 text-warning-700 dark:bg-warning-500/[0.12] dark:text-warning-500";

  return <span className={`mt-1 inline-flex rounded-full px-2.5 py-0.5 text-theme-xs font-medium ${className}`}>{status}</span>;
}

function GateBadge({ gate, compact = false }: { gate: string; compact?: boolean }) {
  const ready = gate === "Ready to export";
  const label = compact && !ready ? "Blocked" : gate;
  return (
    <span
      className={`inline-flex max-w-full items-center gap-1 rounded-full px-2.5 py-0.5 text-theme-xs font-medium ${
        ready
          ? "bg-success-50 text-success-700 dark:bg-success-500/[0.12] dark:text-success-500"
          : "bg-warning-50 text-warning-700 dark:bg-warning-500/[0.12] dark:text-warning-500"
      }`}
      title={gate}
    >
      {ready ? <CheckCircle2 size={13} aria-hidden="true" /> : <ShieldAlert size={13} aria-hidden="true" />}
      <span className={compact ? "" : "truncate"}>{label}</span>
    </span>
  );
}

function FieldControl({
  defaultValue,
  inputMode,
  label,
  maxLength,
  name,
  type
}: {
  defaultValue: string;
  inputMode?: "decimal";
  label: string;
  maxLength?: number;
  name: string;
  type: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block truncate text-theme-xs font-medium uppercase text-gray-500 dark:text-gray-400">{label}</span>
      <input
        className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-theme-sm text-gray-800 shadow-theme-xs outline-none placeholder:text-gray-400 focus:border-brand-300 focus:shadow-focus-ring dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
        defaultValue={defaultValue}
        inputMode={inputMode}
        maxLength={maxLength}
        name={name}
        type={type}
      />
    </label>
  );
}

function statusTone(status: string): "success" | "warning" | "error" {
  if (["ready", "processed", "passed", "complete", "exported", "validated"].includes(status)) {
    return "success";
  }
  if (["failed", "blocked", "error"].includes(status)) {
    return "error";
  }
  return "warning";
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

function fieldForColumn(column: string): { name: string; type: string; inputMode?: "decimal" } {
  switch (column) {
    case "Customer":
      return { name: "customer", type: "text" };
    case "Studio":
      return { name: "studio", type: "text" };
    case "Amount":
      return { name: "amount", type: "text", inputMode: "decimal" };
    case "Memo":
      return { name: "memo", type: "text" };
    case "Invoice Date":
      return { name: "invoice_date", type: "date" };
    case "Due Date":
      return { name: "due_date", type: "date" };
    case "Vertical":
      return { name: "vertical", type: "text" };
    case "Date Entered":
      return { name: "entered_at", type: "date" };
    case "Date Added to Airtable":
      return { name: "exported_at", type: "date" };
    case "Antoinette or Val Invoice#":
      return { name: "invoice_number", type: "text" };
    default:
      return { name: column.toLowerCase().replace(/[^a-z0-9]+/g, "_"), type: "text" };
  }
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

function isMissingTableError(error: { code?: string; message?: string }) {
  return error.code === "42P01" || /record_comments/i.test(error.message ?? "");
}
