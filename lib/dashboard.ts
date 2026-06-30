import { getSupabaseAdmin } from "./supabaseAdmin";
import type {
  CommentsPageData,
  DashboardData,
  FileDashboard,
  ReconciliationPageData,
  ReconciliationRow,
  RecordCommentRow,
  ReviewItemRow,
  SourceFileRow
} from "./types";

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
      .select("id, report_id, report_record_id, status, priority, reason, created_at, reports(report_key, status, invoice_date, due_date, period_end, platforms(display_name))")
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

  const viewFileDashboard = fileDashboard.data ?? emptyFileDashboard;
  const fileDashboardRows = (files.data ?? []) as unknown as SourceFileRow[];
  const resolvedFileDashboard =
    fileDashboard.error || (!fileDashboard.error && viewFileDashboard.files_received === 0 && fileDashboardRows.length > 0)
      ? await directFileDashboard(supabase)
      : viewFileDashboard;

  const reconciliationRows = await attachSourceFileNames(supabase, (reconciliations.data ?? []) as ReconciliationRow[]);
  const reviewRows = await attachReviewSourceFileNames(supabase, (reviews.data ?? []) as unknown as ReviewItemRow[]);

  return {
    configured: true,
    fileDashboard: resolvedFileDashboard,
    reconciliations: reconciliationRows,
    files: fileDashboardRows,
    reviews: reviewRows
  };
}

export async function getReconciliationPage(page: number, pageSize = 5, search = ""): Promise<ReconciliationPageData> {
  const supabase = getSupabaseAdmin();
  const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
  const safePageSize = Number.isFinite(pageSize) && pageSize > 0 ? Math.floor(pageSize) : 5;
  const query = search.trim().toLowerCase();

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

  if (query) {
    const result = await supabase
      .from("admin_report_reconciliation")
      .select("*")
      .order("period_end", { ascending: false, nullsFirst: false })
      .order("report_key", { ascending: true });

    if (result.error) {
      console.error(result.error);
    }

    const rowsWithNames = await attachSourceFileNames(supabase, (result.data ?? []) as ReconciliationRow[]);
    const matchingRows = rowsWithNames.filter((row) => reconciliationMatchesSearch(row, query));
    const totalRows = matchingRows.length;
    const totalPages = Math.max(1, Math.ceil(totalRows / safePageSize));
    const pageToUse = Math.min(safePage, totalPages);
    const from = (pageToUse - 1) * safePageSize;
    const rows = matchingRows.slice(from, from + safePageSize);

    return {
      configured: true,
      rows,
      page: pageToUse,
      pageSize: safePageSize,
      totalRows,
      totalPages
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
    return getReconciliationPage(totalPages, safePageSize, search);
  }

  const rows = await attachSourceFileNames(supabase, (result.data ?? []) as ReconciliationRow[]);

  return {
    configured: true,
    rows,
    page: Math.min(safePage, totalPages),
    pageSize: safePageSize,
    totalRows,
    totalPages
  };
}

function reconciliationMatchesSearch(row: ReconciliationRow, query: string): boolean {
  return [
    row.report_key,
    row.platform,
    row.status,
    row.currency,
    row.period_start,
    row.period_end,
    row.source_file_name,
    ...(row.source_file_names ?? [])
  ]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(query));
}

export async function getCommentsPage(page: number, pageSize = 20, search = ""): Promise<CommentsPageData> {
  const supabase = getSupabaseAdmin();
  const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
  const safePageSize = Number.isFinite(pageSize) && pageSize > 0 ? Math.floor(pageSize) : 20;
  const query = search.trim().toLowerCase();

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

  if (query) {
    const result = await supabase
      .from("record_comments")
      .select(COMMENT_SELECT)
      .order("created_at", { ascending: false });

    if (result.error) {
      console.error(result.error);
      return emptyCommentsPage(true, safePage, safePageSize);
    }

    const rowsWithFiles = await attachCommentSourceFileNames(supabase, toCommentRows(result.data ?? []));
    const matchingRows = rowsWithFiles.filter((row) => commentMatchesSearch(row, query));
    const totalRows = matchingRows.length;
    const totalPages = Math.max(1, Math.ceil(totalRows / safePageSize));
    const pageToUse = Math.min(safePage, totalPages);
    const from = (pageToUse - 1) * safePageSize;

    return {
      configured: true,
      rows: matchingRows.slice(from, from + safePageSize),
      page: pageToUse,
      pageSize: safePageSize,
      totalRows,
      totalPages
    };
  }

  const from = (safePage - 1) * safePageSize;
  const to = from + safePageSize - 1;
  const result = await supabase
    .from("record_comments")
    .select(COMMENT_SELECT, { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, to);

  if (result.error) {
    console.error(result.error);
    return emptyCommentsPage(true, safePage, safePageSize);
  }

  const totalRows = result.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalRows / safePageSize));

  if (safePage > totalPages && totalRows > 0) {
    return getCommentsPage(totalPages, safePageSize, search);
  }

  const rows = await attachCommentSourceFileNames(supabase, toCommentRows(result.data ?? []));
  return {
    configured: true,
    rows,
    page: Math.min(safePage, totalPages),
    pageSize: safePageSize,
    totalRows,
    totalPages
  };
}

const COMMENT_SELECT = `
  id,
  report_id,
  report_record_id,
  comment_text,
  created_by,
  created_at,
  reports(report_key, status, platforms(display_name)),
  report_records(record_key, status, amount, currency, normalized_json)
`;

function emptyCommentsPage(configured: boolean, page: number, pageSize: number): CommentsPageData {
  return {
    configured,
    rows: [],
    page,
    pageSize,
    totalRows: 0,
    totalPages: 1
  };
}

function toCommentRows(rows: unknown[]): RecordCommentRow[] {
  return (rows as any[]).map((row) => {
    const report = nestedSource(row.reports);
    const record = nestedSource(row.report_records);
    const normalized = isObject(record?.normalized_json) ? record.normalized_json : {};
    const amount = isObject(normalized.amount) ? normalized.amount : {};
    return {
      id: String(row.id),
      report_id: String(row.report_id),
      report_record_id: String(row.report_record_id),
      comment_text: String(row.comment_text ?? ""),
      created_by: stringOrNull(row.created_by),
      created_at: String(row.created_at ?? ""),
      report_key: stringOrNull(report?.report_key),
      report_status: stringOrNull(report?.status),
      platform: stringOrNull(nestedSource(report?.platforms)?.display_name),
      source_file_name: null,
      source_file_names: [],
      record_key: stringOrNull(record?.record_key),
      record_status: stringOrNull(record?.status),
      customer: stringOrNull(normalized.customer),
      studio: stringOrNull(normalized.studio),
      amount: amount.amount ?? record?.amount ?? null,
      currency: stringOrNull(amount.currency) ?? stringOrNull(record?.currency),
      memo: stringOrNull(normalized.memo)
    };
  });
}

async function attachCommentSourceFileNames(supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>, rows: RecordCommentRow[]): Promise<RecordCommentRow[]> {
  if (rows.length === 0) {
    return rows;
  }

  const namesByReport = await sourceFileNamesByReportId(supabase, rows.map((row) => row.report_id));
  return rows.map((row) => {
    const names = namesByReport.get(row.report_id) ?? [];
    return {
      ...row,
      source_file_name: names[0] ?? null,
      source_file_names: names
    };
  });
}

function commentMatchesSearch(row: RecordCommentRow, query: string): boolean {
  return [
    row.comment_text,
    row.created_by,
    row.report_key,
    row.report_status,
    row.platform,
    row.record_key,
    row.record_status,
    row.customer,
    row.studio,
    row.memo,
    row.amount,
    row.currency,
    row.source_file_name,
    ...(row.source_file_names ?? [])
  ]
    .filter(Boolean)
    .some((value) => String(value).toLowerCase().includes(query));
}

async function directFileDashboard(supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>): Promise<FileDashboard> {
  const [received, processed, duplicates, failed, awaitingReview] = await Promise.all([
    countSourceFiles(supabase),
    countSourceFiles(supabase, "processed"),
    countSourceFiles(supabase, "duplicate"),
    countSourceFiles(supabase, "failed"),
    countFilesAwaitingReview(supabase)
  ]);

  return {
    files_received: received,
    files_processed: processed,
    duplicate_files: duplicates,
    failed_files: failed,
    files_awaiting_review: awaitingReview
  };
}

async function countSourceFiles(supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>, status?: string): Promise<number> {
  let query = supabase.from("source_files").select("id", { count: "exact", head: true });
  if (status) {
    query = query.eq("status", status);
  }
  const result = await query;
  if (result.error) {
    console.error(result.error);
    return 0;
  }
  return result.count ?? 0;
}

async function countFilesAwaitingReview(supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>): Promise<number> {
  const reviews = await supabase.from("review_items").select("report_id").in("status", ["open", "assigned", "corrected"]);
  if (reviews.error) {
    console.error(reviews.error);
    return 0;
  }

  const reportIds = Array.from(new Set((reviews.data ?? []).map((row: any) => row.report_id).filter(Boolean)));
  if (reportIds.length === 0) {
    return 0;
  }

  const links = await supabase.from("report_source_files").select("source_file_id").in("report_id", reportIds);
  if (links.error) {
    console.error(links.error);
    return 0;
  }

  return new Set((links.data ?? []).map((row: any) => row.source_file_id).filter(Boolean)).size;
}

async function attachSourceFileNames(supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>, rows: ReconciliationRow[]): Promise<ReconciliationRow[]> {
  if (rows.length === 0) {
    return rows;
  }

  const namesByReport = await sourceFileNamesByReportId(supabase, rows.map((row) => row.report_id));
  return rows.map((row) => {
    const names = namesByReport.get(row.report_id) ?? [];
    return {
      ...row,
      source_file_name: names[0] ?? null,
      source_file_names: names
    };
  });
}

async function attachReviewSourceFileNames(supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>, reviews: ReviewItemRow[]): Promise<ReviewItemRow[]> {
  if (reviews.length === 0) {
    return reviews;
  }

  const reportIds = Array.from(new Set(reviews.map((review) => review.report_id).filter(Boolean)));
  const namesByReport = await sourceFileNamesByReportId(supabase, reportIds);

  return reviews.map((review) => {
    const names = namesByReport.get(review.report_id) ?? [];

    return {
      ...review,
      source_file_name: names[0] ?? null,
      source_file_names: names
    };
  });
}

async function sourceFileNamesByReportId(supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>, reportIds: string[]) {
  const uniqueIds = Array.from(new Set(reportIds.filter(Boolean)));
  const namesByReport = new Map<string, string[]>();
  if (uniqueIds.length === 0) {
    return namesByReport;
  }

  const result = await supabase
    .from("report_source_files")
    .select("report_id, role, authoritative, source_files(original_file_name)")
    .in("report_id", uniqueIds);

  if (result.error) {
    console.error(result.error);
    return namesByReport;
  }

  const rows = ((result.data ?? []) as any[]).sort(sourceFileSort);
  for (const row of rows) {
    const name = nestedSourceFileName(row.source_files);
    if (!name) {
      continue;
    }
    const existing = namesByReport.get(row.report_id) ?? [];
    if (!existing.includes(name)) {
      existing.push(name);
    }
    namesByReport.set(row.report_id, existing);
  }
  return namesByReport;
}

function sourceFileSort(a: any, b: any) {
  const score = (row: any) => {
    if (row.authoritative) return 0;
    if (row.role === "primary") return 1;
    if (row.role === "supporting") return 2;
    if (row.role === "verification") return 3;
    return 4;
  };
  return score(a) - score(b);
}

function nestedSource(value: unknown): any {
  return Array.isArray(value) ? value[0] : value;
}

function nestedSourceFileName(value: unknown): string | null {
  const source = Array.isArray(value) ? value[0] : value;
  return isObject(source) && typeof source.original_file_name === "string" ? source.original_file_name : null;
}

function stringOrNull(value: unknown): string | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  return String(value);
}

function isObject(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
