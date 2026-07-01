import { ArrowLeft, DatabaseZap, FileSpreadsheet, FileUp, ShieldCheck } from "lucide-react";
import { getAnalyticsClients } from "@/lib/analyticsDashboard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function AnalyticsUploadPage() {
  const data = await getAnalyticsClients();

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-sm dark:border-gray-800 dark:bg-white/[0.03] md:p-6">
        <a className="inline-flex w-fit items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-theme-sm font-medium text-gray-700 shadow-theme-xs hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400" href="/analytics">
          <ArrowLeft size={16} aria-hidden="true" />
          Unified reports
        </a>
        <div>
          <span className="mb-2 inline-flex items-center gap-2 text-theme-sm font-medium text-brand-500">
            <FileSpreadsheet size={15} aria-hidden="true" />
            New canonical parse
          </span>
          <h1 className="text-2xl font-semibold text-gray-800 dark:text-white/90">Upload a report into the unified analytics format.</h1>
          <p className="mt-2 max-w-4xl text-theme-sm text-gray-500 dark:text-gray-400">
            Select the client so the registry chooses the right deterministic parser. This does not use the existing Airtable upload workflow.
          </p>
        </div>
      </div>

      {!data.configured ? (
        <div className="rounded-xl border border-warning-200 bg-warning-50 px-4 py-3 text-theme-sm font-medium text-warning-700">Supabase is not configured. Add the Supabase URL and server key environment variables.</div>
      ) : null}

      {data.setupRequired ? (
        <div className="rounded-xl border border-warning-200 bg-warning-50 px-4 py-3 text-theme-sm font-medium text-warning-700">Run `supabase/sql/007_analytics_ingestion.sql` before using this upload page.</div>
      ) : null}

      {data.errorMessage ? (
        <div className="rounded-xl border border-error-200 bg-error-50 px-4 py-3 text-theme-sm font-medium text-error-700">{data.errorMessage}</div>
      ) : null}

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]">
        <form action="/api/analytics-upload" method="post" encType="multipart/form-data" className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-sm dark:border-gray-800 dark:bg-white/[0.03] md:p-6">
          <div className="space-y-5">
            <label className="block">
              <span className="mb-1.5 block text-theme-sm font-medium text-gray-700 dark:text-gray-400">Client</span>
              <select className="h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-theme-sm text-gray-800 shadow-theme-xs focus:border-brand-300 focus:outline-hidden focus:ring-3 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90" name="client_id" required disabled={data.clients.length === 0}>
                <option value="">Select client parser</option>
                {data.clients.map((client) => (
                  <option value={client.id} key={client.id}>
                    {client.display_name} - {client.parser_family}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1.5 block text-theme-sm font-medium text-gray-700 dark:text-gray-400">Report file</span>
              <input className="block w-full cursor-pointer rounded-lg border border-gray-300 bg-white text-theme-sm text-gray-800 shadow-theme-xs file:mr-4 file:border-0 file:bg-gray-100 file:px-4 file:py-3 file:text-theme-sm file:font-medium file:text-gray-700 hover:file:bg-gray-200 focus:outline-hidden dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:file:bg-white/[0.03] dark:file:text-gray-300" name="file" type="file" accept=".xlsx,.xls,.csv,.pdf,.docx,.png,.jpg,.jpeg" required />
            </label>
            <label className="flex items-center gap-3">
              <input className="h-4 w-4 rounded border-gray-300 text-brand-500 focus:ring-brand-500 dark:border-gray-700" name="reprocess_duplicate" type="checkbox" />
              <span className="text-theme-sm text-gray-500 dark:text-gray-400">Reprocess if the same SHA-256 file hash already exists</span>
            </label>
          </div>
          <button className="mt-6 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-brand-500 px-4 py-2.5 text-sm font-medium text-white shadow-theme-xs hover:bg-brand-600 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto" type="submit" disabled={data.clients.length === 0}>
            <FileUp size={16} aria-hidden="true" />
            Parse into unified model
          </button>
        </form>

        <aside className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-sm dark:border-gray-800 dark:bg-white/[0.03] md:p-6">
          <div className="mb-4 flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-500">
              <DatabaseZap size={20} aria-hidden="true" />
            </span>
            <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">What gets saved</h2>
          </div>
          <ul className="space-y-3 text-theme-sm text-gray-500 dark:text-gray-400">
            <li>Original file hash and storage URI.</li>
            <li>Canonical report JSON with source, period, totals, and validation.</li>
            <li>Raw workbook tables for audit and future reprocessing.</li>
            <li>Line-level analytics rows for BI queries.</li>
            <li>Field provenance linked back to sheet/page/row/column.</li>
          </ul>
          <div className="mt-5 flex items-center gap-2 rounded-xl border border-success-200 bg-success-50 px-4 py-3 text-theme-sm font-medium text-success-700">
            <ShieldCheck size={16} aria-hidden="true" />
            Airtable export remains a later transform from this normalized data.
          </div>
        </aside>
      </section>
    </div>
  );
}
