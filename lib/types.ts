import type { AirtableRow } from "./airtableExport";

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
  source_file_name: string | null;
  source_file_names: string[];
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
  report_record_id: string | null;
  status: string;
  priority: number;
  reason: string;
  created_at: string;
  source_file_name?: string | null;
  source_file_names?: string[];
  airtable_rows?: ReviewAirtableRow[];
  reports?: {
    report_key: string;
    status: string;
    invoice_date?: string | null;
    due_date?: string | null;
    period_end?: string | null;
    platforms?: {
      display_name: string;
    } | null;
  } | null;
};

export type ReviewAirtableRow = AirtableRow & {
  record_status: string;
  currency: string | null;
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

export type RecordCommentRow = {
  id: string;
  report_id: string;
  report_record_id: string;
  comment_text: string;
  created_by: string | null;
  created_at: string;
  report_key: string | null;
  report_status: string | null;
  platform: string | null;
  source_file_name: string | null;
  source_file_names: string[];
  record_key: string | null;
  record_status: string | null;
  customer: string | null;
  studio: string | null;
  amount: number | string | null;
  currency: string | null;
  memo: string | null;
};

export type CommentsPageData = {
  configured: boolean;
  rows: RecordCommentRow[];
  page: number;
  pageSize: number;
  totalRows: number;
  totalPages: number;
};
