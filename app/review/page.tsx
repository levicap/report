import { CheckCircle, Eye, XCircle } from "lucide-react";
import { getDashboardData } from "@/lib/dashboard";
import { formatDate } from "@/lib/format";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function ReviewPage() {
  const data = await getDashboardData();

  return (
    <>
      <div className="topbar">
        <div>
          <h1>Review</h1>
          <p>Unknown formats, validation failures, ambiguous mappings, and parser warnings.</p>
        </div>
      </div>

      <section className="panel">
        <div className="panel-header">
          <h2>Open Items</h2>
          <span className="preview-count">{data.reviews.length} pending</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>File</th>
                <th>Report</th>
                <th>Priority</th>
                <th>Reason</th>
                <th>Status</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.reviews.map((item) => (
                <tr key={item.id}>
                  <td>
                    <strong>{item.source_file_name ?? "Missing file"}</strong>
                    {item.source_file_names && item.source_file_names.length > 1 ? (
                      <span className="row-subtext">{item.source_file_names.length} source files</span>
                    ) : null}
                  </td>
                  <td>
                    <span>{item.reports?.report_key ?? item.report_id}</span>
                    <span className="row-subtext">{item.reports?.platforms?.display_name ?? "Unknown platform"}</span>
                  </td>
                  <td>{item.priority}</td>
                  <td className="review-reason-cell">{item.reason}</td>
                  <td>
                    <span className={`status ${item.status}`}>{item.status}</span>
                  </td>
                  <td>{formatDate(item.created_at)}</td>
                  <td>
                    <div className="table-actions">
                      <a className="icon-button" href={`/review/${item.id}`} title="Preview review details">
                        <Eye size={15} aria-hidden="true" />
                        <span>Preview</span>
                      </a>
                      <form action={`/api/review/${item.id}/approve`} method="post">
                        <button className="icon-button" type="submit" title="Approve review item">
                          <CheckCircle size={15} aria-hidden="true" />
                          <span>Approve</span>
                        </button>
                      </form>
                      <form action={`/api/review/${item.id}/reject`} method="post">
                        <button className="icon-button danger" type="submit" title="Decline review item">
                          <XCircle size={15} aria-hidden="true" />
                          <span>Decline</span>
                        </button>
                      </form>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.reviews.length === 0 ? <div className="empty">No open review items.</div> : null}
        </div>
      </section>
    </>
  );
}
