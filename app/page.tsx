import type { ReactNode } from "react";
import { Activity, AlertTriangle, CheckCircle2, Clock3, CopyCheck, Database, FileUp, Files, LineChart, Upload, XCircle } from "lucide-react";
import { getDashboardData } from "@/lib/dashboard";
import { compactHash, formatAmount, formatDate } from "@/lib/format";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const data = await getDashboardData();
  const stats = data.fileDashboard;
  const processedRate = stats.files_received > 0 ? Math.round((stats.files_processed / stats.files_received) * 100) : 0;
  const reconciliationIssues = data.reconciliations.filter((row) => {
    const sourceDiff = Number(row.source_to_normalized_difference ?? 0);
    const exportDiff = Number(row.normalized_to_export_difference ?? 0);
    return row.failed_validation_count > 0 || row.open_review_count > 0 || Math.abs(sourceDiff) > Number(row.tolerance_amount ?? 0.01) || Math.abs(exportDiff) > Number(row.tolerance_amount ?? 0.01);
  }).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="mb-1 text-theme-sm font-medium text-brand-500">Operations Control</p>
          <h1 className="text-2xl font-semibold text-gray-800 dark:text-white/90">Accounting normalization dashboard</h1>
          <p className="mt-1 max-w-3xl text-theme-sm text-gray-500 dark:text-gray-400">
            File intake, deterministic parser status, review queues, reconciliation totals, and analytics-ready canonical reports.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <a className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-theme-xs hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-white/[0.03]" href="/analytics/upload">
            <FileUp size={16} aria-hidden="true" />
            Unified upload
          </a>
          <a className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white shadow-theme-xs hover:bg-brand-600" href="/upload">
            <Upload size={16} aria-hidden="true" />
            Airtable upload
          </a>
        </div>
      </div>

      {!data.configured ? (
        <div className="rounded-xl border border-warning-200 bg-warning-50 px-4 py-3 text-theme-sm text-warning-700">
          Supabase is not configured. Set `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_SECRET_KEY`, then run the SQL files in `supabase/sql`.
        </div>
      ) : null}

      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-sm dark:border-gray-800 dark:bg-white/[0.03]" aria-label="Operational status">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-theme-sm font-medium text-gray-500 dark:text-gray-400">Processing Health</p>
            <strong className="mt-1 block text-xl font-semibold text-gray-800 dark:text-white/90">{stats.files_received === 0 ? "No active intake" : `${processedRate}% processed`}</strong>
          </div>
          <div className="flex flex-wrap gap-2">
            <StatusPill>{data.reconciliations.length} reconciliation rows</StatusPill>
            <StatusPill>{reconciliationIssues} needing attention</StatusPill>
            <StatusPill>{data.reviews.length} open review items</StatusPill>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5" aria-label="File status">
        <Stat label="Files Received" value={stats.files_received} icon={<Files size={20} aria-hidden="true" />} />
        <Stat label="Processed" value={stats.files_processed} tone="ok" icon={<CheckCircle2 size={20} aria-hidden="true" />} />
        <Stat label="Duplicates" value={stats.duplicate_files} icon={<CopyCheck size={20} aria-hidden="true" />} />
        <Stat label="Failed" value={stats.failed_files} tone={stats.failed_files > 0 ? "danger" : undefined} icon={<XCircle size={20} aria-hidden="true" />} />
        <Stat label="Awaiting Review" value={stats.files_awaiting_review} tone={stats.files_awaiting_review > 0 ? "warning" : undefined} icon={<Clock3 size={20} aria-hidden="true" />} />
      </section>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.65fr)]">
        <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-sm dark:border-gray-800 dark:bg-white/[0.03]">
          <div className="flex flex-col gap-3 border-b border-gray-200 px-5 py-4 dark:border-gray-800 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">Reconciliation</h2>
              <p className="text-theme-sm text-gray-500 dark:text-gray-400">Source, normalized, and export totals must agree before completion.</p>
            </div>
            <a className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-theme-sm font-medium text-gray-700 shadow-theme-xs hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400" href="/reports">
              <LineChart size={15} aria-hidden="true" />
              Reports
            </a>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr>
                  {["File", "Platform", "Status", "Source", "Normalized", "Export", "Diff", "Open Review"].map((heading) => (
                    <th className="border-b border-gray-100 bg-gray-50 px-5 py-3 text-left text-theme-xs font-medium uppercase text-gray-500 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400" key={heading}>{heading}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.reconciliations.map((row) => (
                  <tr className="border-b border-gray-100 dark:border-gray-800" key={row.report_id}>
                    <td className="px-5 py-4 align-top">
                      <strong className="block max-w-[320px] whitespace-normal break-words text-theme-sm font-medium text-gray-800 dark:text-white/90">{row.source_file_name ?? row.report_key}</strong>
                      <span className="mt-1 block whitespace-normal font-mono text-theme-xs text-gray-500">{row.report_key}</span>
                    </td>
                    <td className="px-5 py-4 text-theme-sm text-gray-500 dark:text-gray-400">{row.platform ?? "Unknown"}</td>
                    <td className="px-5 py-4">
                      <Badge status={row.status} />
                    </td>
                    <td className="px-5 py-4 text-theme-sm text-gray-700 dark:text-gray-300">{formatAmount(row.source_total, row.currency)}</td>
                    <td className="px-5 py-4 text-theme-sm text-gray-700 dark:text-gray-300">{formatAmount(row.normalized_total, row.currency)}</td>
                    <td className="px-5 py-4 text-theme-sm text-gray-700 dark:text-gray-300">{formatAmount(row.export_total, row.currency)}</td>
                    <td className="px-5 py-4">
                      <ReconcileDiff row={row} />
                    </td>
                    <td className="px-5 py-4 text-theme-sm text-gray-700 dark:text-gray-300">{row.open_review_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data.reconciliations.length === 0 ? <div className="px-5 py-10 text-center text-theme-sm text-gray-500">No reports have been processed yet.</div> : null}
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-sm dark:border-gray-800 dark:bg-white/[0.03]">
          <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-gray-800">
            <div>
              <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">Review Queue</h2>
              <p className="text-theme-sm text-gray-500 dark:text-gray-400">Parser uncertainty and validation failures.</p>
            </div>
            <a className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-theme-sm font-medium text-gray-700 shadow-theme-xs hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400" href="/review">
              <AlertTriangle size={15} aria-hidden="true" />
              Open
            </a>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr>
                  {["Priority", "Reason", "Status"].map((heading) => (
                    <th className="border-b border-gray-100 bg-gray-50 px-5 py-3 text-left text-theme-xs font-medium uppercase text-gray-500 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400" key={heading}>{heading}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.reviews.map((item) => (
                  <tr className="border-b border-gray-100 dark:border-gray-800" key={item.id}>
                    <td className="px-5 py-4 text-theme-sm text-gray-700 dark:text-gray-300">{item.priority}</td>
                    <td className="max-w-[360px] whitespace-normal px-5 py-4 text-theme-sm text-gray-500 dark:text-gray-400">{item.reason}</td>
                    <td className="px-5 py-4">
                      <Badge status={item.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data.reviews.length === 0 ? <div className="px-5 py-10 text-center text-theme-sm text-gray-500">No open review items.</div> : null}
          </div>
        </section>
      </div>

      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-sm dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-gray-800">
          <div>
            <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">Recent Files</h2>
            <p className="text-theme-sm text-gray-500 dark:text-gray-400">Immutable source files and duplicate-detection hashes.</p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr>
                {["File", "Status", "Platform", "Hash", "Received"].map((heading) => (
                  <th className="border-b border-gray-100 bg-gray-50 px-5 py-3 text-left text-theme-xs font-medium uppercase text-gray-500 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400" key={heading}>{heading}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.files.map((file) => (
                <tr className="border-b border-gray-100 dark:border-gray-800" key={file.id}>
                  <td className="max-w-[420px] whitespace-normal break-words px-5 py-4 text-theme-sm font-medium text-gray-800 dark:text-white/90">{file.original_file_name}</td>
                  <td className="px-5 py-4">
                    <Badge status={file.status} />
                  </td>
                  <td className="px-5 py-4 text-theme-sm text-gray-500 dark:text-gray-400">{file.platforms?.display_name ?? "Unclassified"}</td>
                  <td className="px-5 py-4 font-mono text-theme-xs text-gray-500">{compactHash(file.source_file_blobs?.sha256)}</td>
                  <td className="px-5 py-4 text-theme-sm text-gray-500 dark:text-gray-400">{formatDate(file.received_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.files.length === 0 ? <div className="px-5 py-10 text-center text-theme-sm text-gray-500">No source files received.</div> : null}
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value, icon, tone }: { label: string; value: number; icon?: ReactNode; tone?: "ok" | "warning" | "danger" }) {
  const toneClass = tone === "ok" ? "text-success-600 bg-success-50" : tone === "warning" ? "text-warning-700 bg-warning-50" : tone === "danger" ? "text-error-700 bg-error-50" : "text-brand-500 bg-brand-50";
  return (
    <article className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-sm dark:border-gray-800 dark:bg-white/[0.03]">
      <div className={`mb-5 flex h-12 w-12 items-center justify-center rounded-xl ${toneClass}`}>{icon}</div>
      <p className="text-theme-sm font-medium text-gray-500 dark:text-gray-400">{label}</p>
      <strong className="mt-1 block text-2xl font-semibold text-gray-800 dark:text-white/90">{value.toLocaleString()}</strong>
    </article>
  );
}

function ReconcileDiff({ row }: { row: { source_to_normalized_difference: string | number | null; normalized_to_export_difference: string | number | null; currency: string | null; tolerance_amount: string | number } }) {
  const sourceDiff = Number(row.source_to_normalized_difference ?? 0);
  const exportDiff = Number(row.normalized_to_export_difference ?? 0);
  const tolerance = Number(row.tolerance_amount ?? 0.01);
  const hasIssue = Math.abs(sourceDiff) > tolerance || Math.abs(exportDiff) > tolerance;

  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-theme-xs font-medium ${hasIssue ? "bg-warning-50 text-warning-700" : "bg-success-50 text-success-700"}`}>
      <Activity size={13} aria-hidden="true" />
      {hasIssue ? formatAmount(sourceDiff || exportDiff, row.currency) : "Balanced"}
    </span>
  );
}

function Badge({ status }: { status: string }) {
  const normalized = status.toLowerCase();
  const tone = ["ready", "processed", "passed", "complete", "exported"].includes(normalized)
    ? "bg-success-50 text-success-700"
    : ["failed", "blocked"].includes(normalized)
      ? "bg-error-50 text-error-700"
      : "bg-warning-50 text-warning-700";
  return <span className={`inline-flex rounded-full px-2.5 py-0.5 text-theme-xs font-medium capitalize ${tone}`}>{status}</span>;
}

function StatusPill({ children }: { children: ReactNode }) {
  return <span className="inline-flex items-center rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-theme-xs font-medium text-gray-600 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-400">{children}</span>;
}
