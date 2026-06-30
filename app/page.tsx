import type { ReactNode } from "react";
import { Activity, AlertTriangle, ArrowRight, CheckCircle2, Clock3, CopyCheck, Files, Upload, XCircle } from "lucide-react";
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
    <>
      <div className="topbar">
        <div>
          <h1>Dashboard</h1>
          <p>File intake, parser status, review queue, and reconciliation totals.</p>
        </div>
        <a className="button" href="/upload">
          <Upload size={16} aria-hidden="true" />
          Upload
        </a>
      </div>

      {!data.configured ? (
        <div className="setup">
          Supabase is not configured. Set `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_SECRET_KEY`, then run the SQL files in `supabase/sql`.
        </div>
      ) : null}

      <section className="control-strip" aria-label="Operational status">
        <div>
          <span className="eyebrow">Processing Health</span>
          <strong>{stats.files_received === 0 ? "No active intake" : `${processedRate}% processed`}</strong>
        </div>
        <div className="control-strip-meta">
          <span>{data.reconciliations.length} reconciliation rows</span>
          <span>{reconciliationIssues} rows needing attention</span>
          <span>{data.reviews.length} open review items loaded</span>
        </div>
      </section>

      <section className="grid stats" aria-label="File status">
        <Stat label="Files Received" value={stats.files_received} icon={<Files size={18} aria-hidden="true" />} />
        <Stat label="Processed" value={stats.files_processed} tone="ok" icon={<CheckCircle2 size={18} aria-hidden="true" />} />
        <Stat label="Duplicates" value={stats.duplicate_files} icon={<CopyCheck size={18} aria-hidden="true" />} />
        <Stat label="Failed" value={stats.failed_files} tone={stats.failed_files > 0 ? "danger" : undefined} icon={<XCircle size={18} aria-hidden="true" />} />
        <Stat label="Awaiting Review" value={stats.files_awaiting_review} tone={stats.files_awaiting_review > 0 ? "warning" : undefined} icon={<Clock3 size={18} aria-hidden="true" />} />
      </section>

      <div className="two-col">
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Reconciliation</h2>
              <p className="subtle">Source, normalized, and export totals must agree before completion.</p>
            </div>
            <a className="button secondary" href="/reports">
              Reports
              <ArrowRight size={15} aria-hidden="true" />
            </a>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>File</th>
                  <th>Platform</th>
                  <th>Status</th>
                  <th>Source</th>
                  <th>Normalized</th>
                  <th>Export</th>
                  <th>Diff</th>
                  <th>Open Review</th>
                </tr>
              </thead>
              <tbody>
                {data.reconciliations.map((row) => (
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
                    <td>{formatAmount(row.export_total, row.currency)}</td>
                    <td>
                      <ReconcileDiff row={row} />
                    </td>
                    <td>{row.open_review_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data.reconciliations.length === 0 ? <div className="empty">No reports have been processed yet.</div> : null}
          </div>
        </section>

        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Review Queue</h2>
              <p className="subtle">Parser uncertainty, validation failures, and policy gaps.</p>
            </div>
            <a className="button secondary" href="/review">
              <AlertTriangle size={15} aria-hidden="true" />
              Open
            </a>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Priority</th>
                  <th>Reason</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.reviews.map((item) => (
                  <tr key={item.id}>
                    <td>{item.priority}</td>
                    <td className="wrap">{item.reason}</td>
                    <td>
                      <span className={`status ${item.status}`}>{item.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data.reviews.length === 0 ? <div className="empty">No open review items.</div> : null}
          </div>
        </section>
      </div>

      <section className="panel" style={{ marginTop: 18 }}>
        <div className="panel-header">
          <div>
            <h2>Recent Files</h2>
            <p className="subtle">Immutable source files and duplicate-detection hashes.</p>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>File</th>
                <th>Status</th>
                <th>Platform</th>
                <th>Hash</th>
                <th>Received</th>
              </tr>
            </thead>
            <tbody>
              {data.files.map((file) => (
                <tr key={file.id}>
                  <td>{file.original_file_name}</td>
                  <td>
                    <span className={`status ${file.status}`}>{file.status}</span>
                  </td>
                  <td>{file.platforms?.display_name ?? "Unclassified"}</td>
                  <td className="code">{compactHash(file.source_file_blobs?.sha256)}</td>
                  <td>{formatDate(file.received_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.files.length === 0 ? <div className="empty">No source files received.</div> : null}
        </div>
      </section>
    </>
  );
}

function Stat({ label, value, icon, tone }: { label: string; value: number; icon?: ReactNode; tone?: "ok" | "warning" | "danger" }) {
  return (
    <div className={`stat ${tone ? `stat-${tone}` : ""}`}>
      <span>
        {icon}
        {label}
      </span>
      <strong>{value}</strong>
    </div>
  );
}

function ReconcileDiff({ row }: { row: { source_to_normalized_difference: string | number | null; normalized_to_export_difference: string | number | null; currency: string | null; tolerance_amount: string | number } }) {
  const sourceDiff = Number(row.source_to_normalized_difference ?? 0);
  const exportDiff = Number(row.normalized_to_export_difference ?? 0);
  const tolerance = Number(row.tolerance_amount ?? 0.01);
  const hasIssue = Math.abs(sourceDiff) > tolerance || Math.abs(exportDiff) > tolerance;

  return (
    <span className={`reconcile-pill ${hasIssue ? "warning" : "ok"}`}>
      <Activity size={13} aria-hidden="true" />
      {hasIssue ? formatAmount(sourceDiff || exportDiff, row.currency) : "Balanced"}
    </span>
  );
}
