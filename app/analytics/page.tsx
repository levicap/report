import { AlertCircle, ArrowRight, BarChart3, Database, FileUp, Layers3, LineChart, Sparkles, Table2 } from "lucide-react";
import { getAnalyticsDashboardData } from "@/lib/analyticsDashboard";
import { formatAmount, formatDate } from "@/lib/format";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  const data = await getAnalyticsDashboardData();
  const summary = data.summary;

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-sm dark:border-gray-800 dark:bg-white/[0.03] md:p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <span className="mb-2 inline-flex items-center gap-2 text-theme-sm font-medium text-brand-500">
              <Sparkles size={15} aria-hidden="true" />
              Canonical report analytics
            </span>
            <h1 className="max-w-3xl text-2xl font-semibold text-gray-800 dark:text-white/90">Normalize every vendor report into one analytics model.</h1>
            <p className="mt-2 max-w-4xl text-theme-sm text-gray-500 dark:text-gray-400">
              Upload a client report, map it to a deterministic parser, preserve raw source tables, and store line-level facts for dashboards before Airtable export.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <a className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white shadow-theme-xs hover:bg-brand-600" href="/analytics/upload">
              <FileUp size={16} aria-hidden="true" />
              New unified upload
            </a>
            <a className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-theme-xs hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400" href="/reports">
              Airtable reports
              <ArrowRight size={15} aria-hidden="true" />
            </a>
          </div>
        </div>
      </section>

      {!data.configured ? (
        <SetupCallout message="Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY." />
      ) : null}

      {data.setupRequired ? (
        <SetupCallout message="Run supabase/sql/007_analytics_ingestion.sql in Supabase before using analytics ingestion." />
      ) : null}

      {data.errorMessage ? (
        <div className="flex items-center gap-2 rounded-xl border border-error-200 bg-error-50 px-4 py-3 text-theme-sm font-medium text-error-700">
          <AlertCircle size={17} aria-hidden="true" />
          <span>{data.errorMessage}</span>
        </div>
      ) : null}

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-6" aria-label="Analytics summary">
        <MetricCard label="Reports" value={summary.reports_count.toLocaleString()} icon={<Database size={18} aria-hidden="true" />} />
        <MetricCard label="Line items" value={summary.line_count.toLocaleString()} icon={<Table2 size={18} aria-hidden="true" />} />
        <MetricCard label="Ready reports" value={summary.ready_reports.toLocaleString()} icon={<LineChart size={18} aria-hidden="true" />} tone="ok" />
        <MetricCard label="Needs attention" value={summary.attention_reports.toLocaleString()} icon={<AlertCircle size={18} aria-hidden="true" />} tone={summary.attention_reports > 0 ? "warning" : "ok"} />
        <MetricCard label="Total parsed" value={formatAmount(summary.total_amount)} icon={<BarChart3 size={18} aria-hidden="true" />} />
        <MetricCard label="Active clients" value={summary.active_clients.toLocaleString()} icon={<Layers3 size={18} aria-hidden="true" />} />
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-sm dark:border-gray-800 dark:bg-white/[0.03]">
          <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-800">
            <div>
              <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">Client Coverage</h2>
              <p className="text-theme-sm text-gray-500 dark:text-gray-400">Client-selected parser families and parsed line volume.</p>
            </div>
          </div>
          <div>
            {data.clients.map((client) => (
              <article className="flex flex-col gap-3 border-b border-gray-100 px-5 py-4 dark:border-gray-800 sm:flex-row sm:items-center sm:justify-between" key={client.client_id}>
                <div>
                  <strong className="block text-theme-sm font-medium text-gray-800 dark:text-white/90">{client.display_name}</strong>
                  <span className="mt-1 block font-mono text-theme-xs text-gray-500 dark:text-gray-400">{client.parser_family}</span>
                </div>
                <div className="flex flex-wrap gap-2 sm:justify-end">
                  <Pill>{client.reports_count} reports</Pill>
                  <Pill>{client.line_count} lines</Pill>
                  <Pill>{formatAmount(client.total_amount, client.currency)}</Pill>
                </div>
              </article>
            ))}
            {data.clients.length === 0 ? <div className="px-5 py-10 text-center text-theme-sm text-gray-500">No analytics clients loaded yet.</div> : null}
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-sm dark:border-gray-800 dark:bg-white/[0.03]">
          <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-800">
            <div>
              <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">Top Studios</h2>
              <p className="text-theme-sm text-gray-500 dark:text-gray-400">Largest normalized line totals from the latest loaded rows.</p>
            </div>
          </div>
          <div>
            {data.topStudios.map((studio) => (
              <article className="flex items-center justify-between gap-4 border-b border-gray-100 px-5 py-4 dark:border-gray-800" key={studio.studio}>
                <div>
                  <strong className="block text-theme-sm font-medium text-gray-800 dark:text-white/90">{studio.studio}</strong>
                  <span className="mt-1 block text-theme-xs text-gray-500 dark:text-gray-400">{studio.lines} source lines</span>
                </div>
                <div className="rounded-lg bg-gray-50 px-3 py-1.5 text-theme-sm font-medium text-gray-700 dark:bg-white/[0.03] dark:text-gray-300">{formatAmount(studio.amount, studio.currency)}</div>
              </article>
            ))}
            {data.topStudios.length === 0 ? <div className="px-5 py-10 text-center text-theme-sm text-gray-500">No studio totals yet.</div> : null}
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-sm dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-800">
          <div>
            <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">Recent Unified Reports</h2>
            <p className="text-theme-sm text-gray-500 dark:text-gray-400">Canonical report JSON, raw tables, line rows, totals, and provenance are saved per upload.</p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr>
                {["File", "Client", "Parser", "Status", "Period", "Total", "Diff", "Loaded", ""].map((heading) => (
                  <th className="border-b border-gray-100 bg-gray-50 px-5 py-3 text-left text-theme-xs font-medium uppercase text-gray-500 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400" key={heading}>{heading}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.recentReports.map((report) => (
                <tr className="border-b border-gray-100 dark:border-gray-800" key={report.id}>
                  <td className="px-5 py-4">
                    <strong className="block max-w-[360px] whitespace-normal break-words text-theme-sm font-medium text-gray-800 dark:text-white/90">{report.source_file_name}</strong>
                    <span className="mt-1 block whitespace-normal font-mono text-theme-xs text-gray-500">{report.report_key}</span>
                  </td>
                  <td className="px-5 py-4 text-theme-sm text-gray-500 dark:text-gray-400">{report.analytics_clients?.display_name ?? "Unknown"}</td>
                  <td className="px-5 py-4 font-mono text-theme-xs text-gray-500">{report.parser_family}</td>
                  <td className="px-5 py-4">
                    <Badge status={report.status} />
                  </td>
                  <td className="px-5 py-4 text-theme-sm text-gray-500 dark:text-gray-400">{report.period_label ?? formatDate(report.period_end)}</td>
                  <td className="px-5 py-4 text-theme-sm text-gray-700 dark:text-gray-300">{formatAmount(report.line_items_total, report.currency)}</td>
                  <td className="px-5 py-4 text-theme-sm text-gray-700 dark:text-gray-300">{formatAmount(report.total_difference, report.currency)}</td>
                  <td className="px-5 py-4 text-theme-sm text-gray-500 dark:text-gray-400">{formatDate(report.created_at)}</td>
                  <td className="px-5 py-4">
                    <a className="text-theme-sm font-medium text-brand-500 hover:text-brand-600" href={`/analytics/reports/${report.id}`}>Preview</a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.recentReports.length === 0 ? <div className="px-5 py-10 text-center text-theme-sm text-gray-500">No unified report uploads yet.</div> : null}
        </div>
      </section>
    </div>
  );
}

function MetricCard({ label, value, icon, tone }: { label: string; value: string; icon: React.ReactNode; tone?: "ok" | "warning" }) {
  const toneClass = tone === "ok" ? "bg-success-50 text-success-600" : tone === "warning" ? "bg-warning-50 text-warning-700" : "bg-brand-50 text-brand-500";
  return (
    <article className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-sm dark:border-gray-800 dark:bg-white/[0.03]">
      <div className={`mb-5 flex h-12 w-12 items-center justify-center rounded-xl ${toneClass}`}>{icon}</div>
      <p className="text-theme-sm font-medium text-gray-500 dark:text-gray-400">{label}</p>
      <strong className="mt-1 block text-2xl font-semibold text-gray-800 dark:text-white/90">{value}</strong>
    </article>
  );
}

function SetupCallout({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-warning-200 bg-warning-50 px-4 py-3 text-theme-sm font-medium text-warning-700">
      <AlertCircle size={17} aria-hidden="true" />
      <span>{message}</span>
    </div>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return <span className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-theme-xs font-medium text-gray-600 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-400">{children}</span>;
}

function Badge({ status }: { status: string }) {
  const normalized = status.toLowerCase();
  const tone = normalized === "ready" ? "bg-success-50 text-success-700" : ["failed", "blocked"].includes(normalized) ? "bg-error-50 text-error-700" : "bg-warning-50 text-warning-700";
  return <span className={`inline-flex rounded-full px-2.5 py-0.5 text-theme-xs font-medium capitalize ${tone}`}>{status}</span>;
}
