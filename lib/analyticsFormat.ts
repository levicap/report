import * as XLSX from "xlsx";
import type { ParserResult } from "./parserRunner";

const RAW_TABLE_ROW_PREVIEW_LIMIT = 500;
const TITLE_ALIASES = ["Title", "title", "Titre", "titre", "Program", "Program Title", "Movie", "Product", "Item", "Description", "Content", "Scene"];
const TITLE_ID_ALIASES = ["Title ID", "TitleID", "ID", "Program ID", "Movie ID", "Content ID", "Asset ID", "SKU", "Référence", "Reference", "r_f_rence"];
const STUDIO_ALIASES = ["Studio", "studio", "Source Studio", "Producer", "producer", "Licensor", "Brand", "Channel", "Label", "Content Provider"];
const PLATFORM_ALIASES = ["Platform", "platform", "Channel", "channel", "Service", "Operator", "operator", "Opérateur/Affilié", "op_rateur_affili", "Retailer", "Store", "Partner", "Distributeur", "distributeur"];
const TERRITORY_ALIASES = ["Territory", "territory", "Country", "country", "Region", "Market"];
const PRODUCT_TYPE_ALIASES = ["Product Type", "product_type", "Type", "Category", "Format", "Rights", "Media", "Type d'acte", "type_d_acte", "act_type"];
const QUANTITY_ALIASES = ["Quantity", "Qty", "Units", "Sales", "Views", "Transactions", "Actes", "actes"];
const SALES_COUNT_ALIASES = ["Sales Count", "sales_count", "Sales", "sales", "Transactions", "transactions", "Units", "units", "Actes", "actes"];
const DOWNLOAD_COUNT_ALIASES = ["Download Count", "download_count", "Downloads", "downloads", "Download", "download"];
const RENTAL_COUNT_ALIASES = ["Rental Count", "rental_count", "Rentals", "rentals", "Rental", "rental", "Locations", "locations"];
const STREAM_COUNT_ALIASES = ["Stream Count", "stream_count", "Streams", "streams", "Stream", "stream", "Views", "views", "Plays", "plays"];
const DURATION_SECONDS_ALIASES = ["Duration Seconds", "duration_seconds", "Duration", "duration", "Seconds", "seconds", "Watch Time", "watch_time"];
const AMOUNT_ALIASES = ["Net", "Net Amount", "Net Revenue", "Total", "Amount", "Royalty", "Royalties", "royalties", "Payout", "Payable", "Revenue", "Reversement distributeur", "reversement_distributeur", "CA Net avant partage", "ca_net_avant_partage"];
const RATE_ALIASES = ["Royalty Rate", "Rate", "Share", "Rev Share", "Revenue Share", "%", "Royalties", "royalties"];

export type AnalyticsClient = {
  id: string;
  client_key: string;
  display_name: string;
  parser_family: string;
  currency: string | null;
  vertical: string | null;
};

export type AnalyticsRawTable = {
  table_key: string;
  table_name: string;
  table_type: string;
  row_count: number;
  column_count: number;
  columns: string[];
  rows: unknown[][];
  metadata: Record<string, unknown>;
};

export type AnalyticsLine = {
  line_id: string;
  line_index: number;
  source_line_id: string | null;
  vendor: string | null;
  report_family: string | null;
  customer: string | null;
  title: string | null;
  source_title_id: string | null;
  source_studio: string | null;
  canonical_studio: string | null;
  source_customer: string | null;
  platform: string | null;
  territory: string | null;
  product_type: string | null;
  quantity: number | null;
  gross_amount: number | null;
  fee_amount: number | null;
  expense_amount: number | null;
  net_amount: number | null;
  royalty_amount: number | null;
  royalty_rate: number | null;
  sales_count: number | null;
  download_count: number | null;
  rental_count: number | null;
  stream_count: number | null;
  duration_seconds: number | null;
  currency: string | null;
  period_start: string | null;
  period_end: string | null;
  raw_fields: Record<string, unknown>;
  source_location: Record<string, unknown>;
};

export type AnalyticsCanonicalReport = {
  schema_version: "analytics_report.v1";
  report: {
    report_key: string;
    client_key: string;
    client_name: string;
    source_file_name: string;
    file_hash: string;
    parser_family: string;
    parser_version: string;
    config_version: string;
    status: string;
  };
  period: {
    start_date: string | null;
    end_date: string | null;
    label: string | null;
  };
  currency: string | null;
  raw_tables: AnalyticsRawTable[];
  line_items: AnalyticsLine[];
  totals: {
    source_total: number | null;
    line_items_total: number | null;
    postings_total: number | null;
    difference: number | null;
    currency: string | null;
  };
  validation: {
    status: string;
    warnings: string[];
    errors: string[];
  };
  parser_output: Record<string, unknown>;
};

export function extractRawTables(bytes: Buffer, fileName: string): AnalyticsRawTable[] {
  const extension = fileName.split(".").pop()?.toLowerCase() ?? "";
  if (!["xlsx", "xls", "csv"].includes(extension)) {
    return [
      {
        table_key: "document_source",
        table_name: fileName,
        table_type: extension || "document",
        row_count: 0,
        column_count: 0,
        columns: [],
        rows: [],
        metadata: {
          note: "Original document stored; deterministic table extraction is parser-specific for this media type."
        }
      }
    ];
  }

  const workbook =
    extension === "csv"
      ? XLSX.read(bytes.toString("utf8"), { type: "string", raw: false })
      : XLSX.read(bytes, { type: "buffer", cellDates: true, raw: false });

  return workbook.SheetNames.map((sheetName, index) => {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      raw: false,
      defval: null,
      blankrows: false
    });
    const columnCount = rows.reduce((max, row) => Math.max(max, Array.isArray(row) ? row.length : 0), 0);
    const header = detectHeader(rows);
    const tableRole = classifyRawTable(sheetName, rows);

    const previewRows = rows.slice(0, RAW_TABLE_ROW_PREVIEW_LIMIT);

    return {
      table_key: `table_${index + 1}`,
      table_name: sheetName,
      table_type: extension === "csv" ? "csv" : "worksheet",
      row_count: rows.length,
      column_count: columnCount,
      columns: header.columns,
      rows: previewRows,
      metadata: {
        table_role: tableRole,
        header_row: header.index === null ? null : header.index + 1,
        stored_row_count: previewRows.length,
        rows_json_truncated: rows.length > previewRows.length,
        row_preview_limit: RAW_TABLE_ROW_PREVIEW_LIMIT
      }
    };
  });
}

export function buildAnalyticsCanonicalReport(
  result: ParserResult,
  client: AnalyticsClient,
  fileName: string,
  sha256: string,
  rawTables: AnalyticsRawTable[]
): AnalyticsCanonicalReport {
  const normalized = objectValue(result.normalized_report);
  const period = objectValue(normalized.period);
  const source = objectValue(normalized.source);
  const reportingParty = objectValue(source.reporting_party);
  const parser = objectValue(normalized.parser);
  const financialSummary = objectValue(normalized.financial_summary);
  const validation = objectValue(normalized.validation);
  const lineItems = arrayValue(normalized.line_items);
  const postings = arrayValue(normalized.accounting_postings);
  const lines = buildAnalyticsLines({
    lineItems: lineItems.length > 0 ? lineItems : postings,
    vendor: client.display_name,
    reportFamily: String(result.report.parser_family ?? parser.parser_family ?? client.parser_family),
    sourceCustomer: stringOrNull(reportingParty.canonical_name) ?? stringOrNull(reportingParty.source_name) ?? client.display_name,
    periodStart: stringOrNull(period.start_date),
    periodEnd: stringOrNull(period.end_date),
    defaultCurrency: stringOrNull(normalized.currency) ?? client.currency,
    defaultProductType: client.vertical
  });
  const lineItemsTotal = sumMoney(lines.map((line) => line.net_amount));
  const postingsTotal = sumMoney(
    postings.map((posting) => moneyAmount(objectValue(posting).amount))
  );
  const sourceTotal =
    moneyAmount(validation.declared_total) ??
    moneyAmount(financialSummary.net_payable) ??
    moneyAmount(financialSummary.period_royalty_earned) ??
    null;
  const difference = sourceTotal === null || lineItemsTotal === null ? null : roundMoney(lineItemsTotal - sourceTotal);
  const validationResults = result.validation_results.map((item) => objectValue(item));

  return {
    schema_version: "analytics_report.v1",
    report: {
      report_key: String(result.report.report_key ?? normalized.report_id ?? `${client.client_key}_${sha256.slice(0, 12)}`),
      client_key: client.client_key,
      client_name: client.display_name,
      source_file_name: fileName,
      file_hash: sha256,
      parser_family: String(result.report.parser_family ?? parser.parser_family ?? client.parser_family),
      parser_version: String(result.report.parser_version ?? parser.parser_version ?? "1.0.0"),
      config_version: String(result.report.config_version ?? parser.config_version ?? "1.0.0"),
      status: String(result.report.status ?? normalized.report_status ?? "review")
    },
    period: {
      start_date: stringOrNull(period.start_date),
      end_date: stringOrNull(period.end_date),
      label: stringOrNull(period.label)
    },
    currency: stringOrNull(normalized.currency) ?? client.currency,
    raw_tables: rawTables,
    line_items: lines,
    totals: {
      source_total: sourceTotal,
      line_items_total: lineItemsTotal,
      postings_total: postingsTotal,
      difference,
      currency: stringOrNull(normalized.currency) ?? client.currency
    },
    validation: {
      status: String(validation.status ?? result.report.status ?? "review"),
      warnings: [
        ...arrayValue(validation.issues).map((item) => String(item)),
        ...validationResults.filter((item) => item.status === "warning").map((item) => String(item.message ?? item.check_name ?? "Warning"))
      ],
      errors: validationResults.filter((item) => item.status === "failed").map((item) => String(item.message ?? item.check_name ?? "Failed validation"))
    },
    parser_output: result.normalized_report
  };
}

function buildAnalyticsLines(args: {
  lineItems: unknown[];
  vendor: string | null;
  reportFamily: string | null;
  sourceCustomer: string | null;
  periodStart: string | null;
  periodEnd: string | null;
  defaultCurrency: string | null;
  defaultProductType: string | null;
}): AnalyticsLine[] {
  return args.lineItems.map((item, index) => {
    const line = objectValue(item);
    const title = objectValue(line.title);
    const studio = objectValue(line.studio);
    const amount = objectValue(line.amount);
    const gross = objectValue(line.gross_amount);
    const fee = objectValue(line.fee_amount);
    const expense = objectValue(line.expense_amount);
    const net = objectValue(line.net_amount);
    const quantity = objectValue(line.quantity);
    const rawFields = objectValue(line.raw_fields);
    const sourceLocation = objectValue(line.source_location);
    const sourceSheet = line.source_sheet ?? sourceLocation.source_sheet ?? sourceLocation.sheet_name ?? sourceLocation.sheet ?? rawFields.source_sheet ?? rawFields.Sheet;
    const sourceRow = line.source_row ?? sourceLocation.source_row ?? sourceLocation.row_number ?? sourceLocation.row ?? rawFields.source_row ?? rawFields.Row;
    const sourceColumn = line.source_column ?? sourceLocation.source_column ?? sourceLocation.column_name ?? sourceLocation.column ?? rawFields.source_column ?? rawFields.Column;
    const customer = firstText(line.customer, line.source_customer, rawField(rawFields, ["Customer", "customer", "Client", "Vendor", "Payor"])) ?? args.sourceCustomer;

    return {
      line_id: String(line.line_id ?? line.posting_id ?? line.record_key ?? `line_${index + 1}`),
      line_index: index,
      source_line_id: stringOrNull(line.line_id ?? line.source_line_id ?? line.record_key),
      vendor: args.vendor,
      report_family: args.reportFamily,
      customer,
      title: firstText(title.source_title, line.title, line.source_title, line.memo, rawField(rawFields, TITLE_ALIASES)),
      source_title_id: firstText(title.source_title_id, line.source_title_id, rawField(rawFields, TITLE_ID_ALIASES)),
      source_studio: firstText(rawField(rawFields, STUDIO_ALIASES), studio.source_name, line.source_studio, line.studio),
      canonical_studio: firstText(studio.canonical_name, studio.billing_entity, line.canonical_studio),
      source_customer: customer,
      platform: firstText(rawField(rawFields, PLATFORM_ALIASES), line.platform, line.channel),
      territory: firstText(line.territory, rawField(rawFields, TERRITORY_ALIASES)),
      product_type: firstText(line.product_type, line.vertical, rawField(rawFields, PRODUCT_TYPE_ALIASES)) ?? args.defaultProductType,
      quantity: numericValue(quantity.value ?? line.quantity ?? rawField(rawFields, QUANTITY_ALIASES)),
      gross_amount: moneyAmount(gross),
      fee_amount: moneyAmount(fee),
      expense_amount: moneyAmount(expense),
      net_amount: moneyAmount(net) ?? moneyAmount(amount) ?? numericValue(line.amount) ?? numericValue(rawField(rawFields, AMOUNT_ALIASES)),
      royalty_amount: moneyAmount(line.royalty_amount),
      royalty_rate: numericValue(line.royalty_rate ?? rawField(rawFields, RATE_ALIASES)),
      sales_count: numericValue(line.sales_count ?? rawField(rawFields, SALES_COUNT_ALIASES)),
      download_count: numericValue(line.download_count ?? rawField(rawFields, DOWNLOAD_COUNT_ALIASES)),
      rental_count: numericValue(line.rental_count ?? rawField(rawFields, RENTAL_COUNT_ALIASES)),
      stream_count: numericValue(line.stream_count ?? rawField(rawFields, STREAM_COUNT_ALIASES)),
      duration_seconds: numericValue(line.duration_seconds ?? rawField(rawFields, DURATION_SECONDS_ALIASES)),
      currency: moneyCurrency(net) ?? moneyCurrency(amount) ?? args.defaultCurrency,
      period_start: stringOrNull(line.period_start) ?? args.periodStart,
      period_end: stringOrNull(line.period_end) ?? args.periodEnd,
      raw_fields: {
        ...rawFields,
        _normalized_source: line
      },
      source_location: {
        ...sourceLocation,
        source_sheet: stringOrNull(sourceSheet),
        source_row: numericValue(sourceRow),
        source_column: stringOrNull(sourceColumn)
      }
    };
  });
}

function firstText(...values: unknown[]): string | null {
  for (const value of values) {
    const normalized = textOrNull(value);
    if (normalized) return normalized;
  }
  return null;
}

function textOrNull(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const object = value as Record<string, unknown>;
    return firstText(
      object.source_name,
      object.canonical_name,
      object.billing_entity,
      object.parent_entity,
      object.source_title,
      object.canonical_title,
      object.name,
      object.label,
      object.value
    );
  }
  return null;
}

function rawField(rawFields: Record<string, unknown>, aliases: string[]): unknown {
  const entries = Object.entries(rawFields);
  for (const alias of aliases) {
    const exact = rawFields[alias];
    if (exact !== undefined && exact !== null && exact !== "") return exact;
    const normalizedAlias = normalizeKey(alias);
    const found = entries.find(([key, value]) => normalizeKey(key) === normalizedAlias && value !== undefined && value !== null && value !== "");
    if (found) return found[1];
  }
  return null;
}

function normalizeKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function detectHeader(rows: unknown[][]): { index: number | null; columns: string[] } {
  let best = { index: null as number | null, columns: [] as string[], score: 0 };
  for (let rowIndex = 0; rowIndex < Math.min(rows.length, 80); rowIndex += 1) {
    const cells = (rows[rowIndex] ?? []).map((cell) => String(cell ?? "").trim()).filter(Boolean);
    if (cells.length < 2) continue;
    const keywords = cells.filter((cell) => /amount|total|royalt|revenue|studio|title|producer|invoice|period|date|gross|net|payout|fee|territory|quantity|sales|vod|share|currency|description|item|product|channel/i.test(cell)).length;
    const numericLike = cells.filter((cell) => /^[-$€£]?\d[\d,.\s%()-]*$/.test(cell)).length;
    const score = keywords * 3 + Math.min(cells.length, 10) - numericLike;
    if (score > best.score) {
      best = { index: rowIndex, columns: cells, score };
    }
  }
  return best.score < 4 ? { index: null, columns: [] } : best;
}

function classifyRawTable(sheetName: string, rows: unknown[][]): "report_data" | "invoice_cover" | "supporting_or_unknown" {
  if (hasTabularReportEvidence(rows)) return "report_data";
  if (/update|delta|adjust/i.test(sheetName)) return "supporting_or_unknown";
  const text = [
    sheetName,
    ...rows
      .slice(0, 40)
      .flatMap((row) => row.slice(0, 20))
      .map((cell) => String(cell ?? ""))
  ].join(" ");
  if (/call\s+for\s+invoice|appel\s+a\s+facture|invoice|facture|amount\s+due|bill\s+to|balance/i.test(text)) {
    return "invoice_cover";
  }
  return "supporting_or_unknown";
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

function objectValue(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, any>) : {};
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringOrNull(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "object") return null;
  return String(value);
}

function numericValue(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const normalized = String(value).replace(/[$€£,\s]/g, "").replace(/^\((.*)\)$/, "-$1");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function moneyAmount(value: unknown): number | null {
  const object = objectValue(value);
  return numericValue(object.amount ?? value);
}

function moneyCurrency(value: unknown): string | null {
  const object = objectValue(value);
  return stringOrNull(object.currency);
}

function sumMoney(values: Array<number | null>): number | null {
  const numeric = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (numeric.length === 0) return null;
  return roundMoney(numeric.reduce((sum, value) => sum + value, 0));
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}
