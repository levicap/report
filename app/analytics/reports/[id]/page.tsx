import { notFound } from "next/navigation";
import { ArrowLeft, Code2, Database, FileText, Table2 } from "lucide-react";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { formatAmount, formatDate } from "@/lib/format";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ page?: string; page_size?: string }>;
};

const DEFAULT_PAGE_SIZE = 100;
const MAX_PAGE_SIZE = 500;
const REQUIRED_QUALITY_KEYS = new Set(["vendor", "report_family", "customer", "title", "source_studio", "platform", "product", "net_amount", "currency"]);
const TITLE_ALIASES = ["Title", "title", "Titre", "titre", "Program", "Program Title", "Movie", "Product", "Item", "Description", "Content", "Scene"];
const TITLE_ID_ALIASES = ["Title ID", "TitleID", "ID", "Program ID", "Movie ID", "Content ID", "Asset ID", "SKU", "Référence", "Reference", "r_f_rence"];
const STUDIO_ALIASES = ["Studio", "studio", "Source Studio", "Producer", "producer", "Licensor", "Brand", "Channel", "Label", "Content Provider"];
const CUSTOMER_ALIASES = ["Customer", "customer", "Client", "Vendor", "Payor"];
const PLATFORM_ALIASES = ["Platform", "platform", "Channel", "channel", "Service", "Operator", "operator", "Opérateur/Affilié", "op_rateur_affili", "Retailer", "Store", "Partner", "Distributeur", "distributeur"];
const TERRITORY_ALIASES = ["Territory", "territory", "Country", "country", "Region", "Market"];
const PRODUCT_TYPE_ALIASES = ["Product Type", "product_type", "Type", "Category", "Format", "Rights", "Media", "Type d'acte", "type_d_acte", "act_type"];
const QUANTITY_ALIASES = ["Quantity", "Qty", "Units", "Sales", "Views", "Transactions", "Actes", "actes"];

export default async function UnifiedReportPreviewPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const query = searchParams ? await searchParams : {};
  const currentPage = parsePositiveInt(query.page, 1);
  const pageSize = Math.min(parsePositiveInt(query.page_size, DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE);
  const from = (currentPage - 1) * pageSize;
  const to = from + pageSize - 1;
  const supabase = getSupabaseAdmin();

  if (!supabase) {
    return <SetupCard message="Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY." />;
  }

  const [reportResult, linesResult, rawTablesResult, totalsResult] = await Promise.all([
    supabase
      .from("analytics_reports")
      .select("*, analytics_clients(display_name, parser_family)")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("analytics_report_lines")
      .select("line_id, line_index, source_line_id, vendor, report_family, customer, title, source_title_id, source_studio, canonical_studio, source_customer, platform, territory, product_type, quantity, gross_amount, fee_amount, expense_amount, net_amount, royalty_amount, royalty_rate, sales_count, download_count, rental_count, stream_count, duration_seconds, currency, period_start, period_end, raw_fields, source_location", { count: "exact" })
      .eq("analytics_report_id", id)
      .order("line_index", { ascending: true })
      .range(from, to),
    supabase
      .from("analytics_raw_tables")
      .select("table_key, table_name, table_type, row_count, column_count, columns, rows_json, metadata")
      .eq("analytics_report_id", id)
      .order("table_key", { ascending: true }),
    supabase
      .from("analytics_report_totals")
      .select("*")
      .eq("analytics_report_id", id)
      .maybeSingle()
  ]);

  if (reportResult.error) {
    if (reportResult.error.code === "42P01") {
      return <SetupCard message="Run supabase/sql/007_analytics_ingestion.sql before opening unified report previews." />;
    }
    throw reportResult.error;
  }
  if (linesResult.error) throw linesResult.error;
  if (rawTablesResult.error) throw rawTablesResult.error;
  if (totalsResult.error) throw totalsResult.error;

  const report = reportResult.data;
  if (!report) notFound();

  const totals = totalsResult.data;
  const rawLines = linesResult.data ?? [];
  const lines = rawLines.map((line) => ({
    ...line,
    vendor: line.vendor ?? report.analytics_clients?.display_name ?? report.vendor,
    report_family: line.report_family ?? report.parser_family,
    customer: line.customer ?? line.source_customer ?? report.analytics_clients?.display_name ?? report.vendor
  }));
  const lineCount = linesResult.count ?? lines.length;
  const totalPages = Math.max(1, Math.ceil(lineCount / pageSize));
  const rawTables = rawTablesResult.data ?? [];
  const parsedSourceSheets = sourceSheetsFromCanonical(report.canonical_report_json, lines);
  const parsedSourceSheetList = Array.from(parsedSourceSheets).sort();
  const rawTableGroups = groupRawTables(rawTables, parsedSourceSheets);
  const previewRawTables = [...rawTableGroups.parsed, ...rawTableGroups.other];
  const allUnifiedColumns = unifiedColumnDefinitions();
  const unifiedColumns = visibleUnifiedColumns(allUnifiedColumns, lines);
  const fieldQuality = buildFieldQuality(lines, allUnifiedColumns);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-sm dark:border-gray-800 dark:bg-white/[0.03] md:p-6">
        <a className="inline-flex w-fit items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-theme-sm font-medium text-gray-700 shadow-theme-xs hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400" href="/analytics">
          <ArrowLeft size={16} aria-hidden="true" />
          Unified reports
        </a>
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <p className="mb-2 text-theme-sm font-medium text-brand-500">Unified Report Preview</p>
            <h1 className="max-w-4xl break-words text-2xl font-semibold text-gray-800 dark:text-white/90">{report.source_file_name}</h1>
            <p className="mt-2 max-w-4xl text-theme-sm text-gray-500 dark:text-gray-400">
              Unified line rows, source-sheet previews, totals, and parser metadata created by the new report-to-unified-format path.
            </p>
          </div>
          <Badge status={report.status} />
        </div>
      </div>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard icon={<FileText size={20} />} label="Client" value={report.analytics_clients?.display_name ?? report.vendor ?? "Unknown"} />
        <SummaryCard icon={<Database size={20} />} label="Parser" value={report.parser_family} />
        <SummaryCard icon={<Table2 size={20} />} label="Line total" value={formatAmount(report.line_items_total, report.currency)} />
        <SummaryCard icon={<Code2 size={20} />} label="Loaded" value={formatDate(report.created_at)} />
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <InfoPanel title="Report Metadata">
          <Definition label="Report key" value={report.report_key} mono />
          <Definition label="SHA-256" value={report.source_sha256} mono />
          <Definition label="Period" value={report.period_label ?? `${formatDate(report.period_start)} - ${formatDate(report.period_end)}`} />
          <Definition label="Parser version" value={report.parser_version ?? "Missing"} />
          <Definition label="Config version" value={report.config_version ?? "Missing"} />
        </InfoPanel>

        <InfoPanel title="Totals">
          <Definition label="Source total" value={formatAmount(report.source_total, report.currency)} />
          <Definition label="Line items total" value={formatAmount(report.line_items_total, report.currency)} />
          <Definition label="Postings total" value={formatAmount(report.postings_total, report.currency)} />
          <Definition label="Difference" value={formatAmount(report.total_difference, report.currency)} />
          <Definition label="Validation" value={totals?.validation_status ?? report.status} />
        </InfoPanel>

        <InfoPanel title="Source Sheets">
          <Definition label="Parsed report sheets" value={String(rawTableGroups.parsed.length)} />
          <Definition label="Other source sheets" value={String(rawTableGroups.other.length)} />
          <Definition label="Ignored invoice/cover sheets" value={String(rawTableGroups.ignored.length)} />
          {previewRawTables.slice(0, 4).map((table) => (
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-white/[0.03]" key={table.table_key}>
              <strong className="block break-words text-theme-sm font-medium text-gray-800 dark:text-white/90">{table.table_name}</strong>
              <span className="mt-1 block text-theme-xs text-gray-500 dark:text-gray-400">
                {table.row_count} rows, {table.column_count} columns
              </span>
            </div>
          ))}
          {rawTables.length > 0 && previewRawTables.length === 0 ? <p className="text-theme-sm text-gray-500">Only invoice/cover sheets were found in the raw preview.</p> : null}
          {rawTables.length === 0 ? <p className="text-theme-sm text-gray-500">No raw table inventory saved.</p> : null}
        </InfoPanel>
      </section>

      <FieldQualityPanel quality={fieldQuality} />

      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-sm dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="flex flex-col gap-3 border-b border-gray-200 px-5 py-4 dark:border-gray-800 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">Unified Report Data</h2>
            <p className="text-theme-sm text-gray-500 dark:text-gray-400">
              Showing rows {lineCount === 0 ? 0 : from + 1}-{Math.min(to + 1, lineCount)} of {lineCount}. This is the normalized table used for analytics.
            </p>
          </div>
          <Pager id={id} currentPage={currentPage} totalPages={totalPages} pageSize={pageSize} />
        </div>
        <div className="overflow-x-auto">
          <table className="unified-data-table min-w-full">
            <thead>
              <tr>
                {unifiedColumns.map((column) => (
                  <th className={`border-b border-gray-100 bg-gray-50 px-5 py-3 text-left text-theme-xs font-medium uppercase text-gray-500 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400 ${column.className ?? ""}`} key={column.key}>{column.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => {
                return (
                  <tr className="border-b border-gray-100 dark:border-gray-800" key={line.line_id}>
                    {unifiedColumns.map((column) => {
                      const value = column.render(line);
                      return (
                        <td className={`px-5 py-4 text-theme-sm text-gray-500 dark:text-gray-400 ${column.className ?? ""}`} key={column.key}>
                          <CellValue value={value} />
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
          {lines.length === 0 ? <div className="px-5 py-10 text-center text-theme-sm text-gray-500">No line rows saved for this report.</div> : null}
        </div>
        <div className="border-t border-gray-200 px-5 py-4 dark:border-gray-800">
          <Pager id={id} currentPage={currentPage} totalPages={totalPages} pageSize={pageSize} />
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-sm dark:border-gray-800 dark:bg-white/[0.03]">
        <div className="border-b border-gray-200 px-5 py-4 dark:border-gray-800">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">Source Table Preview</h2>
          <p className="text-theme-sm text-gray-500 dark:text-gray-400">
            Report data sheets only. Invoice and cover sheets are ignored here but the untouched file is still stored for audit.
            {parsedSourceSheetList.length > 0 ? ` Parsed lines use: ${parsedSourceSheetList.join(", ")}.` : ""}
          </p>
        </div>
        <div className="space-y-4 p-5">
          {previewRawTables.map((table) => (
            <details className="overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]" key={table.table_key} open={parsedSourceSheets.has(String(table.table_name)) || rawTables.length === 1}>
              <summary className="cursor-pointer bg-gray-50 px-4 py-3 text-theme-sm font-medium text-gray-800 dark:bg-gray-900 dark:text-white/90">
                {table.table_name} - {table.row_count} rows, {table.column_count} columns
                {parsedSourceSheets.has(String(table.table_name)) ? " (parsed line source)" : ""}
                {metadataValue(table.metadata, "rows_json_truncated") ? " (preview stored)" : ""}
              </summary>
              <RawTablePreview table={table} />
            </details>
          ))}
          {previewRawTables.length === 0 ? <div className="px-5 py-10 text-center text-theme-sm text-gray-500">No report data sheet preview was identified. Invoice/cover sheets are ignored for parsing.</div> : null}
          {rawTableGroups.ignored.length > 0 ? (
            <details className="overflow-hidden rounded-xl border border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-white/[0.03]">
              <summary className="cursor-pointer px-4 py-3 text-theme-sm font-medium text-gray-700 dark:text-gray-300">
                Ignored invoice/cover sheets ({rawTableGroups.ignored.length})
              </summary>
              <div className="divide-y divide-gray-100 dark:divide-gray-800">
                {rawTableGroups.ignored.map((table) => (
                  <div className="px-4 py-3 text-theme-sm text-gray-500 dark:text-gray-400" key={table.table_key}>
                    {table.table_name} - {table.row_count} rows, {table.column_count} columns
                  </div>
                ))}
              </div>
            </details>
          ) : null}
        </div>
      </section>

      <details className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-theme-sm dark:border-gray-800 dark:bg-white/[0.03]">
        <summary className="cursor-pointer border-b border-gray-200 px-5 py-4 text-lg font-semibold text-gray-800 dark:border-gray-800 dark:text-white/90">
          Canonical JSON audit payload
        </summary>
        <pre className="max-h-[560px] overflow-auto bg-gray-950 p-5 text-xs leading-6 text-gray-100">{JSON.stringify(report.canonical_report_json, null, 2)}</pre>
      </details>
    </div>
  );
}

function SetupCard({ message }: { message: string }) {
  return <div className="rounded-xl border border-warning-200 bg-warning-50 px-4 py-3 text-theme-sm font-medium text-warning-700">{message}</div>;
}

function SummaryCard({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <article className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-sm dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50 text-brand-500">{icon}</div>
      <p className="text-theme-sm font-medium text-gray-500 dark:text-gray-400">{label}</p>
      <strong className="mt-1 block break-words text-lg font-semibold text-gray-800 dark:text-white/90">{value}</strong>
    </article>
  );
}

function InfoPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-sm dark:border-gray-800 dark:bg-white/[0.03]">
      <h2 className="mb-4 text-lg font-semibold text-gray-800 dark:text-white/90">{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Definition({ label, value, mono }: { label: string; value: string | null | undefined; mono?: boolean }) {
  return (
    <div>
      <dt className="text-theme-xs font-medium uppercase text-gray-500 dark:text-gray-400">{label}</dt>
      <dd className={`mt-1 break-words text-theme-sm text-gray-800 dark:text-white/90 ${mono ? "font-mono" : ""}`}>{value || "Missing"}</dd>
    </div>
  );
}

type UnifiedColumn = {
  key: string;
  label: string;
  className?: string;
  always?: boolean;
  quality?: boolean;
  value: (line: any) => unknown;
  render: (line: any) => string;
};

function unifiedColumnDefinitions(): UnifiedColumn[] {
  return [
    {
      key: "row",
      label: "#",
      className: "col-row",
      always: true,
      quality: false,
      value: (line) => line.line_index + 1,
      render: (line) => String(line.line_index + 1)
    },
    {
      key: "title",
      label: "Title",
      className: "col-title",
      always: true,
      value: (line) => displayFieldValue(line.title, line.raw_fields, TITLE_ALIASES),
      render: (line) => displayFieldValue(line.title, line.raw_fields, TITLE_ALIASES)
    },
    {
      key: "source_studio",
      label: "Source Studio",
      className: "col-studio",
      always: true,
      value: (line) => displayPreferredRaw(line.source_studio, line.raw_fields, STUDIO_ALIASES),
      render: (line) => displayPreferredRaw(line.source_studio, line.raw_fields, STUDIO_ALIASES)
    },
    {
      key: "canonical_studio",
      label: "Mapped Studio",
      className: "col-studio",
      always: true,
      value: (line) => line.canonical_studio,
      render: (line) => formatCell(line.canonical_studio)
    },
    {
      key: "platform",
      label: "Platform",
      className: "col-platform",
      always: true,
      value: (line) => displayPreferredRaw(line.platform, line.raw_fields, PLATFORM_ALIASES),
      render: (line) => displayPreferredRaw(line.platform, line.raw_fields, PLATFORM_ALIASES)
    },
    {
      key: "net_amount",
      label: "Net",
      className: "col-money",
      always: true,
      value: (line) => line.net_amount,
      render: (line) => formatAmount(line.net_amount, line.currency)
    },
    {
      key: "currency",
      label: "Currency",
      className: "col-currency",
      always: true,
      value: (line) => line.currency,
      render: (line) => formatCell(line.currency)
    },
    {
      key: "source",
      label: "Source",
      className: "col-source",
      always: true,
      quality: false,
      value: (line) => sourceLocationLabel(line.source_location),
      render: (line) => sourceLocationLabel(line.source_location)
    },
    {
      key: "vendor",
      label: "Vendor",
      className: "col-customer",
      value: (line) => line.vendor,
      render: (line) => formatCell(line.vendor)
    },
    {
      key: "report_family",
      label: "Report Family",
      className: "col-platform",
      value: (line) => line.report_family,
      render: (line) => formatCell(line.report_family)
    },
    {
      key: "title_id",
      label: "Title ID",
      className: "col-id",
      value: (line) => displayFieldValue(line.source_title_id, line.raw_fields, TITLE_ID_ALIASES),
      render: (line) => displayFieldValue(line.source_title_id, line.raw_fields, TITLE_ID_ALIASES)
    },
    {
      key: "customer",
      label: "Customer",
      className: "col-customer",
      value: (line) => displayFieldValue(line.customer ?? line.source_customer, line.raw_fields, CUSTOMER_ALIASES),
      render: (line) => displayFieldValue(line.customer ?? line.source_customer, line.raw_fields, CUSTOMER_ALIASES)
    },
    {
      key: "territory",
      label: "Territory",
      className: "col-small",
      value: (line) => displayFieldValue(line.territory, line.raw_fields, TERRITORY_ALIASES),
      render: (line) => displayFieldValue(line.territory, line.raw_fields, TERRITORY_ALIASES)
    },
    {
      key: "product",
      label: "Product",
      className: "col-small",
      value: (line) => displayPreferredRaw(line.product_type, line.raw_fields, PRODUCT_TYPE_ALIASES),
      render: (line) => displayPreferredRaw(line.product_type, line.raw_fields, PRODUCT_TYPE_ALIASES)
    },
    {
      key: "quantity",
      label: "Qty",
      className: "col-small",
      value: (line) => displayFieldValue(line.quantity, line.raw_fields, QUANTITY_ALIASES),
      render: (line) => displayFieldValue(line.quantity, line.raw_fields, QUANTITY_ALIASES)
    },
    {
      key: "gross",
      label: "Gross",
      className: "col-money",
      value: (line) => line.gross_amount,
      render: (line) => formatAmount(line.gross_amount, line.currency)
    },
    {
      key: "fee",
      label: "Fee",
      className: "col-money",
      value: (line) => line.fee_amount,
      render: (line) => formatAmount(line.fee_amount, line.currency)
    },
    {
      key: "expense",
      label: "Expense",
      className: "col-money",
      value: (line) => line.expense_amount,
      render: (line) => formatAmount(line.expense_amount, line.currency)
    },
    {
      key: "royalty",
      label: "Royalty",
      className: "col-money",
      value: (line) => line.royalty_amount,
      render: (line) => formatAmount(line.royalty_amount, line.currency)
    },
    {
      key: "rate",
      label: "Rate",
      className: "col-small",
      value: (line) => line.royalty_rate,
      render: (line) => formatPercent(line.royalty_rate)
    },
    {
      key: "sales_count",
      label: "Sales",
      className: "col-small",
      value: (line) => line.sales_count,
      render: (line) => formatNumeric(line.sales_count)
    },
    {
      key: "download_count",
      label: "Downloads",
      className: "col-small",
      value: (line) => line.download_count,
      render: (line) => formatNumeric(line.download_count)
    },
    {
      key: "rental_count",
      label: "Rentals",
      className: "col-small",
      value: (line) => line.rental_count,
      render: (line) => formatNumeric(line.rental_count)
    },
    {
      key: "stream_count",
      label: "Streams",
      className: "col-small",
      value: (line) => line.stream_count,
      render: (line) => formatNumeric(line.stream_count)
    },
    {
      key: "duration_seconds",
      label: "Duration Sec",
      className: "col-small",
      value: (line) => line.duration_seconds,
      render: (line) => formatNumeric(line.duration_seconds)
    }
  ];
}

function visibleUnifiedColumns(columns: UnifiedColumn[], lines: any[]): UnifiedColumn[] {
  return columns.filter((column) => column.always || lines.some((line) => !isMissingValue(column.value(line))));
}

type FieldQualityItem = {
  key: string;
  label: string;
  present: number;
  missing: number;
  total: number;
};

type FieldQuality = {
  rowCount: number;
  requiredParsedCellCount: number;
  requiredMissingCellCount: number;
  requiredTotalCellCount: number;
  parsedFields: FieldQualityItem[];
  requiredPartialFields: FieldQualityItem[];
  optionalPresentFields: FieldQualityItem[];
  optionalAbsentFields: FieldQualityItem[];
};

function buildFieldQuality(lines: any[], columns: UnifiedColumn[]): FieldQuality {
  const qualityColumns = columns.filter((column) => column.quality !== false);
  const fields = qualityColumns.map((column) => {
    const present = lines.filter((line) => !isMissingValue(column.value(line))).length;
    const total = lines.length;
    return {
      key: column.key,
      label: column.label,
      present,
      missing: total - present,
      total
    };
  });
  const requiredFields = fields.filter((field) => REQUIRED_QUALITY_KEYS.has(field.key));
  const requiredParsedCellCount = requiredFields.reduce((sum, field) => sum + field.present, 0);
  const requiredMissingCellCount = requiredFields.reduce((sum, field) => sum + field.missing, 0);

  return {
    rowCount: lines.length,
    requiredParsedCellCount,
    requiredMissingCellCount,
    requiredTotalCellCount: requiredParsedCellCount + requiredMissingCellCount,
    parsedFields: fields.filter((field) => field.present > 0),
    requiredPartialFields: requiredFields.filter((field) => field.missing > 0),
    optionalPresentFields: fields.filter((field) => !REQUIRED_QUALITY_KEYS.has(field.key) && field.present > 0),
    optionalAbsentFields: fields.filter((field) => !REQUIRED_QUALITY_KEYS.has(field.key) && field.present === 0)
  };
}

function FieldQualityPanel({ quality }: { quality: FieldQuality }) {
  if (quality.rowCount === 0) return null;
  const parsedPercent = quality.requiredTotalCellCount === 0 ? 0 : Math.round((quality.requiredParsedCellCount / quality.requiredTotalCellCount) * 100);

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-theme-sm dark:border-gray-800 dark:bg-white/[0.03]">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-800 dark:text-white/90">Unified Field Completeness</h2>
          <p className="text-theme-sm text-gray-500 dark:text-gray-400">
            Coverage counts required analytics fields only. Optional fields not supplied by a vendor are listed separately and do not reduce coverage.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <MetricPill label="Required parsed" value={`${quality.requiredParsedCellCount}`} />
          <MetricPill label="Required missing" value={`${quality.requiredMissingCellCount}`} />
          <MetricPill label="Required coverage" value={`${parsedPercent}%`} />
        </div>
      </div>
      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <FieldChipGroup title="Parsed fields" items={quality.parsedFields} tone="success" empty="No parsed fields found." />
        <FieldChipGroup title="Required gaps" items={quality.requiredPartialFields} tone="warning" empty="No required gaps." />
        <FieldChipGroup title="Optional not supplied" items={quality.optionalAbsentFields} tone="muted" empty="No fully absent optional fields." />
      </div>
    </section>
  );
}

function MetricPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 dark:border-gray-800 dark:bg-white/[0.03]">
      <strong className="block text-base font-semibold text-gray-800 dark:text-white/90">{value}</strong>
      <span className="text-theme-xs font-medium text-gray-500 dark:text-gray-400">{label}</span>
    </div>
  );
}

function FieldChipGroup({ title, items, tone, empty }: { title: string; items: FieldQualityItem[]; tone: "success" | "warning" | "muted"; empty: string }) {
  const toneClass =
    tone === "success"
      ? "border-success-200 bg-success-50 text-success-700"
      : tone === "warning"
        ? "border-warning-200 bg-warning-50 text-warning-700"
        : "border-gray-200 bg-gray-50 text-gray-600 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-400";

  return (
    <div>
      <h3 className="mb-2 text-theme-sm font-medium text-gray-800 dark:text-white/90">{title}</h3>
      <div className="flex flex-wrap gap-2">
        {items.length > 0 ? (
          items.map((item) => (
            <span className={`inline-flex rounded-full border px-2.5 py-1 text-theme-xs font-medium ${toneClass}`} key={item.key}>
              {item.label}
              {item.missing > 0 && item.present > 0 ? ` (${item.missing} missing)` : ""}
            </span>
          ))
        ) : (
          <span className="text-theme-sm text-gray-500 dark:text-gray-400">{empty}</span>
        )}
      </div>
    </div>
  );
}

function CellValue({ value }: { value: string }) {
  if (value === "Missing" || value === "[object Object]") {
    return <span className="inline-flex max-w-full rounded-md bg-warning-50 px-1.5 py-0.5 text-[10px] font-medium leading-4 text-warning-700">Missing</span>;
  }
  return <span className="cell-clip" title={value}>{value}</span>;
}

function Pager({ id, currentPage, totalPages, pageSize }: { id: string; currentPage: number; totalPages: number; pageSize: number }) {
  const previous = currentPage > 1 ? currentPage - 1 : null;
  const next = currentPage < totalPages ? currentPage + 1 : null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <a className={`inline-flex h-9 items-center justify-center rounded-lg border px-3 text-theme-sm font-medium ${previous ? "border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400" : "pointer-events-none border-gray-200 bg-gray-50 text-gray-400 dark:border-gray-800 dark:bg-white/[0.03]"}`} href={previous ? reportPageHref(id, previous, pageSize) : "#"}>
        Previous
      </a>
      <span className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-theme-xs font-medium text-gray-600 dark:border-gray-800 dark:bg-white/[0.03] dark:text-gray-400">
        Page {currentPage} of {totalPages}
      </span>
      <a className={`inline-flex h-9 items-center justify-center rounded-lg border px-3 text-theme-sm font-medium ${next ? "border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400" : "pointer-events-none border-gray-200 bg-gray-50 text-gray-400 dark:border-gray-800 dark:bg-white/[0.03]"}`} href={next ? reportPageHref(id, next, pageSize) : "#"}>
        Next
      </a>
    </div>
  );
}

function RawTablePreview({ table }: { table: any }) {
  const rows = normalizeRawRows(table.rows_json);
  const columnIndexes = rawPreviewColumnIndexes(rows);
  const storedRowCount = Number(metadataValue(table.metadata, "stored_row_count") ?? rows.length);
  const rowCount = Number(table.row_count ?? rows.length);

  return (
    <div className="overflow-x-auto">
      <div className="border-b border-gray-100 px-4 py-2 text-theme-xs text-gray-500 dark:border-gray-800 dark:text-gray-400">
        Showing {storedRowCount} stored preview rows of {rowCount}. Blank worksheet cells are intentionally empty.
      </div>
      <table className="source-preview-table min-w-full">
        <thead>
          <tr>
            <th className="border-b border-gray-100 bg-gray-50 px-4 py-2 text-left text-theme-xs font-medium uppercase text-gray-500 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400">Row</th>
            {columnIndexes.map((columnIndex) => (
              <th className="border-b border-gray-100 bg-gray-50 px-4 py-2 text-left text-theme-xs font-medium uppercase text-gray-500 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400" key={columnIndex}>{columnLetter(columnIndex)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr className="border-b border-gray-100 dark:border-gray-800" key={rowIndex}>
              <td className="px-4 py-2 font-mono text-theme-xs text-gray-500">{rowIndex + 1}</td>
              {columnIndexes.map((cellIndex) => (
                <td className="max-w-[320px] whitespace-normal break-words px-4 py-2 text-theme-xs text-gray-600 dark:text-gray-400" key={cellIndex}>
                  {formatRawCell(row[cellIndex])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 ? (
        <div className="px-5 py-6 text-center text-theme-sm text-gray-500">
          {Number(table.row_count ?? 0) > 0 ? "No source row preview is stored for this table. Reprocess the report to populate raw sheet preview rows." : "No source rows stored for this table."}
        </div>
      ) : null}
    </div>
  );
}

function reportPageHref(id: string, page: number, pageSize: number) {
  return `/analytics/reports/${id}?page=${page}&page_size=${pageSize}`;
}

function parsePositiveInt(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeRawRows(value: unknown): unknown[][] {
  if (!Array.isArray(value)) return [];
  return value.map((row) => (Array.isArray(row) ? row : [row]));
}

function rawPreviewColumnIndexes(rows: unknown[][]): number[] {
  const maxRowLength = rows.reduce((max, row) => Math.max(max, row.length), 0);
  const indexes = Array.from({ length: maxRowLength }, (_, index) => index);
  const visible = indexes.filter((index) => rows.some((row) => !isBlankRawCell(row[index])));
  return visible.length > 0 ? visible : indexes;
}

function columnLetter(index: number): string {
  let value = index + 1;
  let label = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    value = Math.floor((value - 1) / 26);
  }
  return label;
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined || value === "") return "Missing";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "Missing";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

function formatRawCell(value: unknown): string {
  if (isBlankRawCell(value)) return "";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

function isBlankRawCell(value: unknown): boolean {
  return value === null || value === undefined || value === "";
}

function formatPercent(value: unknown): string {
  if (value === null || value === undefined || value === "") return "Missing";
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return String(value);
  return `${numeric.toLocaleString(undefined, { maximumFractionDigits: 4 })}%`;
}

function formatNumeric(value: unknown): string {
  if (value === null || value === undefined || value === "") return "Missing";
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return String(value);
  return numeric.toLocaleString(undefined, { maximumFractionDigits: 6 });
}

function rawFieldsSummary(value: Record<string, unknown> | null): string {
  if (!value || Object.keys(value).length === 0) return "Missing";
  const entries = Object.entries(value)
    .filter(([key]) => key !== "_normalized_source")
    .slice(0, 8)
    .map(([key, item]) => `${key}: ${formatCell(item)}`);
  return entries.length > 0 ? entries.join(" | ") : "Stored";
}

function displayField(value: unknown, rawFields: Record<string, unknown> | null, aliases: string[]): string {
  return displayFieldValue(value, rawFields, aliases);
}

function displayFieldValue(value: unknown, rawFields: Record<string, unknown> | null, aliases: string[]): string {
  const direct = formatCell(value);
  if (direct !== "Missing") return direct;
  return formatCell(rawField(rawFields, aliases));
}

function displayPreferredRaw(value: unknown, rawFields: Record<string, unknown> | null, aliases: string[]): string {
  const raw = rawField(rawFields, aliases);
  if (!isMissingValue(raw)) return formatCell(raw);
  return formatCell(value);
}

function sourceLocationLabel(value: unknown): string {
  const source = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const sheet = source.source_sheet ?? source.sheet_name ?? source.sheet;
  const row = source.source_row ?? source.row_number ?? source.row;
  if (isMissingValue(sheet) && isMissingValue(row)) return "Missing";
  return [formatCell(sheet), row ? `row ${formatCell(row)}` : null].filter(Boolean).join(" ");
}

function objectValue(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, any>) : {};
}

function sourceSheetsFromCanonical(canonicalReport: unknown, visibleLines: any[]): Set<string> {
  const sourceSheets = new Set<string>();
  const canonical = canonicalReport && typeof canonicalReport === "object" && !Array.isArray(canonicalReport) ? (canonicalReport as Record<string, unknown>) : {};
  const lineItems = Array.isArray(canonical.line_items) ? canonical.line_items : [];
  for (const line of [...lineItems, ...visibleLines]) {
    const source = objectValue(objectValue(line).source_location);
    const sheet = source.source_sheet ?? source.sheet_name ?? source.sheet;
    if (!isMissingValue(sheet)) sourceSheets.add(String(sheet));
  }
  return sourceSheets;
}

function groupRawTables(tables: any[], parsedSourceSheets: Set<string>): { parsed: any[]; other: any[]; ignored: any[] } {
  return tables.reduce(
    (groups, table) => {
      const tableName = String(table.table_name ?? "");
      if (parsedSourceSheets.has(tableName)) {
        groups.parsed.push(table);
      } else if (isLikelyInvoiceOrCoverTable(table)) {
        groups.ignored.push(table);
      } else {
        groups.other.push(table);
      }
      return groups;
    },
    { parsed: [] as any[], other: [] as any[], ignored: [] as any[] }
  );
}

function isLikelyInvoiceOrCoverTable(table: any): boolean {
  const explicitRole = String(metadataValue(table.metadata, "table_role") ?? "");
  if (["invoice_cover", "audit_only", "ignored_invoice"].includes(explicitRole)) return true;
  const tableName = String(table.table_name ?? "");
  if (/update|delta|adjust/i.test(tableName)) return false;

  const rows = normalizeRawRows(table.rows_json);
  const text = [
    tableName,
    ...rows
      .slice(0, 40)
      .flatMap((row) => row.slice(0, 20))
      .map((cell) => String(cell ?? ""))
  ].join(" ");
  const hasInvoiceLanguage = /call\s+for\s+invoice|appel\s+a\s+facture|invoice|facture|amount\s+due|bill\s+to|balance/i.test(text);
  return hasInvoiceLanguage && !hasTabularReportEvidence(rows);
}

function hasTabularReportEvidence(rows: unknown[][]): boolean {
  return rows.slice(0, 80).some((row) => {
    const cells = row.map((cell) => String(cell ?? "").trim()).filter(Boolean);
    if (cells.length < 7) return false;
    const joined = cells.join(" ");
    const keywordCount = cells.filter((cell) => /studio|producer|title|titre|amount|royalt|reversement|net|gross|qty|quantity|actes|territory|country|platform|operator|op.rateur|affiliate|item\s+code|extension\s+amt|description/i.test(cell)).length;
    const hasIdentityColumn = /studio|producer|title|titre|item\s+code|description/i.test(joined);
    const hasValueColumn = /amount|royalt|reversement|net|gross|extension\s+amt|actes|qty|quantity/i.test(joined);
    return keywordCount >= 3 && hasIdentityColumn && hasValueColumn;
  });
}

function isMissingValue(value: unknown): boolean {
  return value === null || value === undefined || value === "" || value === "Missing" || value === "[object Object]";
}

function rawField(rawFields: Record<string, unknown> | null, aliases: string[]): unknown {
  if (!rawFields) return null;
  const entries = Object.entries(rawFields);
  for (const alias of aliases) {
    const exact = rawFields[alias];
    if (exact !== undefined && exact !== null && exact !== "") return exact;
    const normalizedAlias = normalizeKey(alias);
    const found = entries.find(([key, item]) => normalizeKey(key) === normalizedAlias && item !== undefined && item !== null && item !== "");
    if (found) return found[1];
  }
  return null;
}

function normalizeKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function metadataValue(metadata: unknown, key: string): unknown {
  return metadata && typeof metadata === "object" && !Array.isArray(metadata) ? (metadata as Record<string, unknown>)[key] : null;
}

function Badge({ status }: { status: string }) {
  const normalized = status.toLowerCase();
  const tone = normalized === "ready" ? "bg-success-50 text-success-700" : ["failed", "blocked"].includes(normalized) ? "bg-error-50 text-error-700" : "bg-warning-50 text-warning-700";
  return <span className={`inline-flex w-fit rounded-full px-2.5 py-0.5 text-theme-xs font-medium capitalize ${tone}`}>{status}</span>;
}
