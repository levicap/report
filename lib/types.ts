export type FileDashboard = {
  files_received: number;
  files_processed: number;
  duplicate_files: number;
  failed_files: number;
  files_awaiting_review: number;
};

export type ReconciliationRow = {
  report_id: string;
  report_key: string;
  platform: string | null;
  status: string;
  period_start: string | null;
  period_end: string | null;
  currency: string | null;
  source_total: number | string | null;
  normalized_total: number | string | null;
  export_total: number | string | null;
  source_to_normalized_difference: number | string | null;
  normalized_to_export_difference: number | string | null;
  failed_validation_count: number;
  warning_validation_count: number;
  open_review_count: number;
  tolerance_amount: number | string;
};

export type SourceFileRow = {
  id: string;
  original_file_name: string;
  status: string;
  received_channel: string;
  received_at: string;
  source_metadata: Record<string, unknown>;
  source_file_blobs?: {
    sha256: string;
    byte_size: number;
    media_type: string;
  } | null;
  platforms?: {
    display_name: string;
  } | null;
};

export type ReviewItemRow = {
  id: string;
  report_id: string;
  status: string;
  priority: number;
  reason: string;
  created_at: string;
  reports?: {
    report_key: string;
    status: string;
    platforms?: {
      display_name: string;
    } | null;
  } | null;
};

export type DashboardData = {
  configured: boolean;
  fileDashboard: FileDashboard;
  reconciliations: ReconciliationRow[];
  files: SourceFileRow[];
  reviews: ReviewItemRow[];
};

export type ReconciliationPageData = {
  configured: boolean;
  rows: ReconciliationRow[];
  page: number;
  pageSize: number;
  totalRows: number;
  totalPages: number;
};
