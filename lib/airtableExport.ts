export type AirtableRow = {
  csvFields: Record<string, string | number | null>;
  apiFields: Record<string, string | number>;
  source: {
    report_id: string;
    report_record_id: string;
    record_key: string;
  };
};

export type ReportExportDefaults = {
  invoiceDate: string | null;
  dueDate: string | null;
};

export const AIRTABLE_COLUMNS = [
  "Customer",
  "Studio",
  "Amount",
  "Memo",
  "Invoice Date",
  "Due Date",
  "Vertical",
  "Date Entered",
  "Date Added to Airtable",
  "Antoinette or Val Invoice#"
];

export function buildAirtableRows(records: any[], defaults: ReportExportDefaults): AirtableRow[] {
  const fallbackDueDate = defaults.dueDate ?? addMonths(defaults.invoiceDate, 2);
  return records.map((record) =>
    buildAirtableRow(record, {
      invoiceDate: defaults.invoiceDate,
      dueDate: fallbackDueDate
    })
  );
}

export function toCsv(rows: Array<Record<string, string | number | null>>): string {
  return [
    AIRTABLE_COLUMNS.join(","),
    ...rows.map((row) => AIRTABLE_COLUMNS.map((column) => csvEscape(row[column] ?? "")).join(","))
  ].join("\r\n");
}

export function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

export function safeFileName(value: string): string {
  return value.replace(/[^\w.-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 120) || "airtable-export";
}

function buildAirtableRow(record: any, defaults: ReportExportDefaults): AirtableRow {
  const csvFields = {
    Customer: valueOrBlank(record.customer),
    Studio: valueOrBlank(record.studio),
    Amount: roundCurrencyAmount(record.amount),
    Memo: valueOrBlank(record.memo),
    "Invoice Date": valueOrBlank(record.invoice_date ?? defaults.invoiceDate),
    "Due Date": valueOrBlank(record.due_date ?? defaults.dueDate),
    Vertical: valueOrBlank(record.vertical),
    "Date Entered": "",
    "Date Added to Airtable": "",
    "Antoinette or Val Invoice#": valueOrBlank(record.invoice_number)
  };

  return {
    csvFields,
    apiFields: compactFields(csvFields),
    source: {
      report_id: record.report_id,
      report_record_id: record.report_record_id,
      record_key: record.record_key
    }
  };
}

function compactFields(fields: Record<string, string | number | null>): Record<string, string | number> {
  return Object.fromEntries(
    Object.entries(fields).filter(([, value]) => value !== null && value !== "")
  ) as Record<string, string | number>;
}

function valueOrBlank(value: unknown): string {
  return value === null || value === undefined ? "" : String(value);
}

function roundCurrencyAmount(value: unknown): number {
  const numeric = Number(value ?? 0);
  if (!Number.isFinite(numeric)) {
    return 0;
  }
  return Math.round((numeric + Number.EPSILON) * 100) / 100;
}

function addMonths(value: string | null, months: number): string | null {
  if (!value) {
    return null;
  }
  const [yearText, monthText, dayText] = value.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }

  const target = new Date(Date.UTC(year, month - 1 + months, 1));
  const targetYear = target.getUTCFullYear();
  const targetMonth = target.getUTCMonth();
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const targetDay = Math.min(day, lastDay);

  return `${targetYear}-${String(targetMonth + 1).padStart(2, "0")}-${String(targetDay).padStart(2, "0")}`;
}

function csvEscape(value: string | number): string {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
