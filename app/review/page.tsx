import { CheckCircle, XCircle } from "lucide-react";
import { getDashboardData } from "@/lib/dashboard";
import { formatDate } from "@/lib/format";

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
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Priority</th>
                <th>Report</th>
                <th>Reason</th>
                <th>Created</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {data.reviews.map((item) => (
                <tr key={item.id}>
                  <td>{item.priority}</td>
                  <td className="code">{item.reports?.report_key ?? item.report_id}</td>
                  <td className="wrap">{item.reason}</td>
                  <td>{formatDate(item.created_at)}</td>
                  <td>
                    <div style={{ display: "flex", gap: 8 }}>
                      <form action={`/api/review/${item.id}/approve`} method="post">
                        <button className="button secondary" type="submit" title="Approve review item">
                          <CheckCircle size={15} aria-hidden="true" />
                          Approve
                        </button>
                      </form>
                      <form action={`/api/review/${item.id}/reject`} method="post">
                        <button className="button secondary" type="submit" title="Reject review item">
                          <XCircle size={15} aria-hidden="true" />
                          Reject
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

