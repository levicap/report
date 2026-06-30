import { ChevronLeft, ChevronRight, ExternalLink, MessageSquareText, Search } from "lucide-react";
import { getCommentsPage } from "@/lib/dashboard";
import { formatAmount, formatDate } from "@/lib/format";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CommentsPageProps = {
  searchParams: Promise<{ page?: string; q?: string }>;
};

const PAGE_SIZE = 20;

export default async function CommentsPage({ searchParams }: CommentsPageProps) {
  const params = await searchParams;
  const currentPage = parsePage(params.page);
  const query = normalizeQuery(params.q);
  const data = await getCommentsPage(currentPage, PAGE_SIZE, query);
  const firstRow = data.totalRows === 0 ? 0 : (data.page - 1) * data.pageSize + 1;
  const lastRow = Math.min(data.page * data.pageSize, data.totalRows);

  return (
    <>
      <div className="topbar">
        <div>
          <h1>Comments</h1>
          <p>Record-level accounting notes with the report, file, and Airtable row context.</p>
        </div>
      </div>

      {!data.configured ? (
        <div className="setup">
          Supabase is not configured. Set `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_SECRET_KEY`.
        </div>
      ) : null}

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Record Comments</h2>
            <p className="subtle">
              Showing {firstRow}-{lastRow} of {data.totalRows}
            </p>
          </div>
          <div className="report-toolbar">
            <form className="search-form" action="/comments">
              <Search size={15} aria-hidden="true" />
              <input name="q" defaultValue={query} placeholder="Search comments" aria-label="Search comments" />
              <button className="button secondary" type="submit">
                Search
              </button>
            </form>
            <Pagination page={data.page} totalPages={data.totalPages} query={query} />
          </div>
        </div>

        <div className="comment-index">
          {data.rows.map((row) => (
            <article className="comment-row" key={row.id}>
              <div className="comment-row-icon">
                <MessageSquareText size={17} aria-hidden="true" />
              </div>
              <div className="comment-row-main">
                <div className="comment-row-header">
                  <div>
                    <strong>{row.source_file_name ?? row.report_key ?? "Missing file"}</strong>
                    <span className="row-subtext code">{row.report_key ?? row.report_id}</span>
                  </div>
                  <span className={`status ${row.record_status ?? "review"}`}>{row.record_status ?? "unknown"}</span>
                </div>
                <p className="comment-body">{row.comment_text}</p>
                <dl className="comment-context">
                  <Meta label="Author" value={row.created_by || "dashboard"} />
                  <Meta label="Created" value={formatDate(row.created_at)} />
                  <Meta label="Platform" value={row.platform ?? "Unknown"} />
                  <Meta label="Record" value={row.record_key ?? row.report_record_id} />
                  <Meta label="Customer" value={row.customer ?? "Missing"} />
                  <Meta label="Studio" value={row.studio ?? "Missing"} />
                  <Meta label="Amount" value={formatAmount(row.amount, row.currency)} />
                </dl>
                {row.memo ? <p className="comment-memo">{row.memo}</p> : null}
                <div className="comment-actions">
                  <a className="button secondary" href={`/reports/${row.report_id}/export-preview#record-${row.report_record_id}`}>
                    <ExternalLink size={15} aria-hidden="true" />
                    Open record
                  </a>
                </div>
              </div>
            </article>
          ))}
          {data.rows.length === 0 ? <div className="empty">{query ? "No comments matched the search." : "No record comments yet."}</div> : null}
        </div>
      </section>
    </>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function Pagination({ page, totalPages, query }: { page: number; totalPages: number; query: string }) {
  const hasPrevious = page > 1;
  const hasNext = page < totalPages;

  return (
    <nav className="pagination" aria-label="Comment pages">
      <a className={`button secondary ${hasPrevious ? "" : "disabled"}`} href={hasPrevious ? commentsPageHref(page - 1, query) : "#"} aria-disabled={!hasPrevious}>
        <ChevronLeft size={15} aria-hidden="true" />
        Previous
      </a>
      <span>
        Page {page} of {totalPages}
      </span>
      <a className={`button secondary ${hasNext ? "" : "disabled"}`} href={hasNext ? commentsPageHref(page + 1, query) : "#"} aria-disabled={!hasNext}>
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

function commentsPageHref(page: number, query: string): string {
  const params = new URLSearchParams({ page: String(page) });
  if (query) {
    params.set("q", query);
  }
  return `/comments?${params.toString()}`;
}
