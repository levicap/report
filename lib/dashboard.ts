import { getSupabaseAdmin } from "./supabaseAdmin";
import type { DashboardData, FileDashboard, ReconciliationPageData, ReconciliationRow, ReviewItemRow, SourceFileRow } from "./types";

const emptyFileDashboard: FileDashboard = {
  files_received: 0,
  files_processed: 0,
  duplicate_files: 0,
  failed_files: 0,
  files_awaiting_review: 0
};

export async function getDashboardData(): Promise<DashboardData> {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return {
      configured: false,
      fileDashboard: emptyFileDashboard,
      reconciliations: [],
      files: [],
      reviews: []
    };
  }

  const [fileDashboard, reconciliations, files, reviews] = await Promise.all([
    supabase.from("admin_file_dashboard").select("*").maybeSingle<FileDashboard>(),
    supabase.from("admin_report_reconciliation").select("*").order("period_end", { ascending: false, nullsFirst: false }).limit(20),
    supabase
      .from("source_files")
      .select("id, original_file_name, status, received_channel, received_at, source_metadata, source_file_blobs(sha256, byte_size, media_type), platforms(display_name)")
      .order("received_at", { ascending: false })
      .limit(20),
    supabase
      .from("review_items")
      .select("id, report_id, status, priority, reason, created_at, reports(report_key, status, platforms(display_name))")
      .in("status", ["open", "assigned", "corrected"])
      .order("priority", { ascending: true })
      .order("created_at", { ascending: false })
      .limit(20)
  ]);

  if (fileDashboard.error) {
    console.error(fileDashboard.error);
  }
  if (reconciliations.error) {
    console.error(reconciliations.error);
  }
  if (files.error) {
    console.error(files.error);
  }
  if (reviews.error) {
    console.error(reviews.error);
  }

  return {
    configured: true,
    fileDashboard: fileDashboard.data ?? emptyFileDashboard,
    reconciliations: (reconciliations.data ?? []) as ReconciliationRow[],
    files: (files.data ?? []) as unknown as SourceFileRow[],
    reviews: (reviews.data ?? []) as unknown as ReviewItemRow[]
  };
}

export async function getReconciliationPage(page: number, pageSize = 5): Promise<ReconciliationPageData> {
  const supabase = getSupabaseAdmin();
  const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
  const safePageSize = Number.isFinite(pageSize) && pageSize > 0 ? Math.floor(pageSize) : 5;

  if (!supabase) {
    return {
      configured: false,
      rows: [],
      page: safePage,
      pageSize: safePageSize,
      totalRows: 0,
      totalPages: 1
    };
  }

  const from = (safePage - 1) * safePageSize;
  const to = from + safePageSize - 1;
  const result = await supabase
    .from("admin_report_reconciliation")
    .select("*", { count: "exact" })
    .order("period_end", { ascending: false, nullsFirst: false })
    .order("report_key", { ascending: true })
    .range(from, to);

  if (result.error) {
    console.error(result.error);
  }

  const totalRows = result.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalRows / safePageSize));

  if (safePage > totalPages && totalRows > 0) {
    return getReconciliationPage(totalPages, safePageSize);
  }

  return {
    configured: true,
    rows: (result.data ?? []) as ReconciliationRow[],
    page: Math.min(safePage, totalPages),
    pageSize: safePageSize,
    totalRows,
    totalPages
  };
}
