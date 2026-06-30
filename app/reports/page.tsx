import { ChevronLeft, ChevronRight, Eye, Search } from "lucide-react";
import { getReconciliationPage } from "@/lib/dashboard";
import { formatAmount } from "@/lib/format";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ReportsPageProps = {
  searchParams: Promise<{ page?: string; q?: string }>;
};

const PAGE_SIZE = 5;

export default async function ReportsPage({ searchParams }: ReportsPageProps) {
  const params = await searchParams;
  const currentPage = parsePage(params.page);
  const query = normalizeQuery(params.q);
  const data = await getReconciliationPage(currentPage, PAGE_SIZE, query);
  const firstRow = data.totalRows === 0 ? 0 : (data.page - 1) * data.pageSize + 1;
  const lastRow = Math.min(data.page * data.pageSize, data.totalRows);

  return (
    <>
      <div className="topbar">
        <div>
          <h1>Reports</h1>
          <p>Normalized report status and stage totals from PostgreSQL.</p>
        </div>
      </div>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Report Reconciliation</h2>
            <p className="subtle">
              Showing {firstRow}-{lastRow} of {data.totalRows}
            </p>
          </div>
          <div className="report-toolbar">
            <form className="search-form" action="/reports">
              <Search size={15} aria-hidden="true" />
              <input name="q" defaultValue={query} placeholder="Search reports" aria-label="Search reports" />
              <button className="button secondary" type="submit">
                Search
              </button>
            </form>
            <Pagination page={data.page} totalPages={data.totalPages} query={query} />
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>File</th>
                <th>Platform</th>
                <th>Status</th>
                <th>Source Total</th>
                <th>Normalized Total</th>
                <th>Source Diff</th>
                <th>Export Diff</th>
                <th>Export</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => (
                <tr key={row.report_id}>
                  <td>
                    <strong className="file-title">{row.source_file_name ?? row.report_key}</strong>
                    <span className="row-subtext code">{row.report_key}</span>
                  </td>
                  <td>{row.platform ?? "Unknown"}</td>
                  <td>
                    <span className={`status ${row.status}`}>{row.status}</span>
                  </td>
                  <td>{formatAmount(row.source_total, row.currency)}</td>
                  <td>{formatAmount(row.normalized_total, row.currency)}</td>
                  <td>{formatAmount(row.source_to_normalized_difference, row.currency)}</td>
                  <td>{formatAmount(row.normalized_to_export_difference, row.currency)}</td>
                  <td>
                    <a className="button secondary" href={`/reports/${row.report_id}/export-preview`} title="Preview Airtable rows">
                      <Eye size={15} aria-hidden="true" />
                      Preview
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.rows.length === 0 ? <div className="empty">{query ? "No reports matched the search." : "No processed reports."}</div> : null}
        </div>
      </section>
    </>
  );
}

function Pagination({ page, totalPages, query }: { page: number; totalPages: number; query: string }) {
  const hasPrevious = page > 1;
  const hasNext = page < totalPages;

  return (
    <nav className="pagination" aria-label="Report pages">
      <a className={`button secondary ${hasPrevious ? "" : "disabled"}`} href={hasPrevious ? reportsPageHref(page - 1, query) : "#"} aria-disabled={!hasPrevious}>
        <ChevronLeft size={15} aria-hidden="true" />
        Previous
      </a>
      <span>
        Page {page} of {totalPages}
      </span>
      <a className={`button secondary ${hasNext ? "" : "disabled"}`} href={hasNext ? reportsPageHref(page + 1, query) : "#"} aria-disabled={!hasNext}>
        Next
        <ChevronRight size={15} aria-hidden="true" />
      </a>
    </nav>
  );
}

function parsePage(value: string | undefined): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

function normalizeQuery(value: string | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function reportsPageHref(page: number, query: string): string {
  const params = new URLSearchParams({ page: String(page) });
  if (query) {
    params.set("q", query);
  }
  return `/reports?${params.toString()}`;
}
