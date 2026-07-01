import { getSupabaseAdmin } from "./supabaseAdmin";

export type AnalyticsClientOption = {
  id: string;
  client_key: string;
  display_name: string;
  parser_family: string;
  vertical: string | null;
  currency: string | null;
};

export type AnalyticsDashboardData = {
  configured: boolean;
  setupRequired: boolean;
  errorMessage?: string;
  summary: {
    reports_count: number;
    line_count: number;
    ready_reports: number;
    attention_reports: number;
    total_amount: number;
    active_clients: number;
  };
  clients: Array<AnalyticsClientOption & {
    client_id: string;
    reports_count: number;
    line_count: number;
    total_amount: number;
    last_report_at: string | null;
  }>;
  recentReports: Array<{
    id: string;
    report_key: string;
    source_file_name: string;
    status: string;
    parser_family: string;
    period_label: string | null;
    period_end: string | null;
    currency: string | null;
    line_items_total: number | string | null;
    total_difference: number | string | null;
    created_at: string;
    analytics_clients?: { display_name: string } | null;
  }>;
  topStudios: Array<{
    studio: string;
    amount: number;
    currency: string | null;
    lines: number;
  }>;
};

const emptySummary = {
  reports_count: 0,
  line_count: 0,
  ready_reports: 0,
  attention_reports: 0,
  total_amount: 0,
  active_clients: 0
};

export async function getAnalyticsClients(): Promise<{ configured: boolean; setupRequired: boolean; clients: AnalyticsClientOption[]; errorMessage?: string }> {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return { configured: false, setupRequired: false, clients: [] };
  }

  let result;
  try {
    result = await supabase
      .from("analytics_clients")
      .select("id, client_key, display_name, parser_family, vertical, currency")
      .eq("enabled", true)
      .order("display_name", { ascending: true });
  } catch (error) {
    return {
      configured: true,
      setupRequired: false,
      clients: [],
      errorMessage: `Could not reach Supabase analytics tables: ${errorMessage(error)}`
    };
  }

  if (result.error) {
    if (isMissingAnalyticsTable(result.error)) {
      return { configured: true, setupRequired: true, clients: [] };
    }
    return {
      configured: true,
      setupRequired: false,
      clients: [],
      errorMessage: `Could not load analytics clients: ${errorMessage(result.error)}`
    };
  }

  return {
    configured: true,
    setupRequired: false,
    clients: (result.data ?? []) as AnalyticsClientOption[]
  };
}

export async function getAnalyticsDashboardData(): Promise<AnalyticsDashboardData> {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return {
      configured: false,
      setupRequired: false,
      errorMessage: undefined,
      summary: emptySummary,
      clients: [],
      recentReports: [],
      topStudios: []
    };
  }

  let summaryResult;
  let clientsResult;
  let reportsResult;
  let linesResult;
  try {
    [summaryResult, clientsResult, reportsResult, linesResult] = await Promise.all([
      supabase.from("analytics_dashboard_summary").select("*").maybeSingle(),
      supabase
        .from("analytics_client_summary")
        .select("*")
        .order("last_report_at", { ascending: false, nullsFirst: false })
        .limit(12),
      supabase
        .from("analytics_reports")
        .select("id, report_key, source_file_name, status, parser_family, period_label, period_end, currency, line_items_total, total_difference, created_at, analytics_clients(display_name)")
        .order("created_at", { ascending: false })
        .limit(12),
      supabase
        .from("analytics_report_lines")
        .select("canonical_studio, net_amount, currency")
        .not("net_amount", "is", null)
        .limit(1000)
    ]);
  } catch (error) {
    return {
      configured: true,
      setupRequired: false,
      errorMessage: `Could not reach Supabase analytics tables: ${errorMessage(error)}`,
      summary: emptySummary,
      clients: [],
      recentReports: [],
      topStudios: []
    };
  }

  const missingSetupError = [summaryResult.error, clientsResult.error, reportsResult.error, linesResult.error].find((error) => error && isMissingAnalyticsTable(error));
  if (missingSetupError) {
    return {
      configured: true,
      setupRequired: true,
      errorMessage: undefined,
      summary: emptySummary,
      clients: [],
      recentReports: [],
      topStudios: []
    };
  }

  const firstError = [summaryResult.error, clientsResult.error, reportsResult.error, linesResult.error].find(Boolean);
  if (firstError) {
    return {
      configured: true,
      setupRequired: false,
      errorMessage: `Could not load analytics dashboard data: ${errorMessage(firstError)}`,
      summary: emptySummary,
      clients: [],
      recentReports: [],
      topStudios: []
    };
  }

  return {
    configured: true,
    setupRequired: false,
    summary: normalizeSummary(summaryResult.data),
    clients: (clientsResult.data ?? []) as AnalyticsDashboardData["clients"],
    recentReports: (reportsResult.data ?? []) as unknown as AnalyticsDashboardData["recentReports"],
    topStudios: summarizeStudios(linesResult.data ?? [])
  };
}

function normalizeSummary(value: any): AnalyticsDashboardData["summary"] {
  if (!value) return emptySummary;
  return {
    reports_count: Number(value.reports_count ?? 0),
    line_count: Number(value.line_count ?? 0),
    ready_reports: Number(value.ready_reports ?? 0),
    attention_reports: Number(value.attention_reports ?? 0),
    total_amount: Number(value.total_amount ?? 0),
    active_clients: Number(value.active_clients ?? 0)
  };
}

function summarizeStudios(rows: any[]): AnalyticsDashboardData["topStudios"] {
  const groups = new Map<string, { studio: string; amount: number; currency: string | null; lines: number }>();
  for (const row of rows) {
    const studio = String(row.canonical_studio || "Unmapped studio");
    const amount = Number(row.net_amount ?? 0);
    const existing = groups.get(studio) ?? { studio, amount: 0, currency: row.currency ?? null, lines: 0 };
    existing.amount += Number.isFinite(amount) ? amount : 0;
    existing.lines += 1;
    groups.set(studio, existing);
  }
  return Array.from(groups.values())
    .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
    .slice(0, 8)
    .map((item) => ({ ...item, amount: Math.round(item.amount * 100) / 100 }));
}

function isMissingAnalyticsTable(error: { code?: string; message?: string }) {
  return error.code === "42P01" || /analytics_/i.test(error.message ?? "");
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object") {
    const value = error as {
      code?: unknown;
      status?: unknown;
      statusCode?: unknown;
      title?: unknown;
      message?: unknown;
      detail?: unknown;
      details?: unknown;
      hint?: unknown;
      error_code?: unknown;
      error_name?: unknown;
      retry_after?: unknown;
    };
    const parts = [
      value.code,
      value.status,
      value.statusCode,
      value.title,
      value.message,
      value.detail,
      value.details,
      value.hint,
      value.error_code,
      value.error_name,
      value.retry_after ? `retry_after=${value.retry_after}` : null
    ].filter(Boolean).map(String);
    if (parts.length > 0) return parts.join(" | ");
  }
  return String(error);
}
