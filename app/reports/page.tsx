import { ChevronLeft, ChevronRight, Eye } from "lucide-react";
import { getReconciliationPage } from "@/lib/dashboard";
import { formatAmount } from "@/lib/format";

type ReportsPageProps = {
  searchParams: Promise<{ page?: string }>;
};

const PAGE_SIZE = 5;

export default async function ReportsPage({ searchParams }: ReportsPageProps) {
  const params = await searchParams;
  const currentPage = parsePage(params.page);
  const data = await getReconciliationPage(currentPage, PAGE_SIZE);
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
          <Pagination page={data.page} totalPages={data.totalPages} />
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Report</th>
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
                  <td className="code">{row.report_key}</td>
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
          {data.rows.length === 0 ? <div className="empty">No processed reports.</div> : null}
        </div>
      </section>
    </>
  );
}

function Pagination({ page, totalPages }: { page: number; totalPages: number }) {
  const hasPrevious = page > 1;
  const hasNext = page < totalPages;

  return (
    <nav className="pagination" aria-label="Report pages">
      <a className={`button secondary ${hasPrevious ? "" : "disabled"}`} href={hasPrevious ? `/reports?page=${page - 1}` : "#"} aria-disabled={!hasPrevious}>
        <ChevronLeft size={15} aria-hidden="true" />
        Previous
      </a>
      <span>
        Page {page} of {totalPages}
      </span>
      <a className={`button secondary ${hasNext ? "" : "disabled"}`} href={hasNext ? `/reports?page=${page + 1}` : "#"} aria-disabled={!hasNext}>
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
