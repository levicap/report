import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import xlsx from "xlsx";

const XLSX = xlsx.default ?? xlsx;
const require = createRequire(import.meta.url);

const root = process.cwd();
const docsDir = path.join(root, "docs");
const outDir = path.join(root, ".tmp", "bundle-preview-build");
const packageDir = path.join(root, "accounting_normalization_package");
const manifestPath = path.join(packageDir, "file_manifest.csv");
const airtablePath = path.join(root, "Accounting Project", "Copy of NMG Airtable Data Entry - This is where you will find processed through Airtable  data.xlsx");
const outputCsv = path.join(docsDir, "bundle_preview.csv");
const outputMd = path.join(docsDir, "bundle_preview.md");

fs.mkdirSync(docsDir, { recursive: true });
fs.mkdirSync(outDir, { recursive: true });

compileParser(outDir);

const { parseReportFromBuffer } = require(path.join(outDir, "parserRunner.js"));
const manifest = readCsv(manifestPath);
const actualFileByHash = buildActualFileIndex(path.join(root, "Accounting Project"));
const airtableRows = readAirtableRows(airtablePath);

const bundleRows = [
  ...buildHpgBundleRows(),
  ...buildAdultTimeBundleRows()
].sort((a, b) => {
  const family = a.bundle_family.localeCompare(b.bundle_family);
  if (family !== 0) return family;
  return [a.invoice_date, a.memo, a.studio, a.bundle_key].join("|").localeCompare([b.invoice_date, b.memo, b.studio, b.bundle_key].join("|"));
});

writeCsv(outputCsv, bundleRows);
fs.writeFileSync(outputMd, renderMarkdown(bundleRows), "utf8");

console.log(`Bundle preview rows: ${bundleRows.length}`);
console.log(`Wrote ${path.relative(root, outputCsv)}`);
console.log(`Wrote ${path.relative(root, outputMd)}`);

function buildHpgBundleRows() {
  const hpgFiles = manifest
    .filter((row) => row.include_in_ingestion === "yes")
    .filter((row) => row.processing_role === "primary_source")
    .filter((row) => ["xlsx_hpg_canal", "xlsx_hpg_netgem", "xlsx_hpg_proximus"].includes(row.parser_family))
    .sort((a, b) => Number(a.file_index || 0) - Number(b.file_index || 0));

  const grouped = new Map();
  for (const manifestRow of hpgFiles) {
    const parsed = parseManifestFile(manifestRow);
    const report = parsed.result.normalized_report ?? {};
    const posting = Array.isArray(report.accounting_postings) ? report.accounting_postings[0] : null;
    if (!posting) continue;

    const periodLabel = String(report.period?.label ?? manifestRow.period_hint ?? "").trim();
    const channel = hpgChannel(manifestRow);
    const batch = hpgBatch(periodLabel, channel);
    const studio = String(posting.studio ?? "").trim();
    const memo = String(posting.memo ?? "").trim();
    const invoiceDate = String(posting.invoice_date ?? report.period?.invoice_date ?? "").trim();
    const dueDate = String(posting.due_date ?? report.period?.due_date ?? "").trim();
    const currency = String(posting.amount?.currency ?? report.currency ?? "EUR").trim();
    const key = ["hpg", periodLabel, batch, studio, memo, invoiceDate, dueDate, currency].join("|");
    const cents = toCents(posting.amount?.amount);

    if (!grouped.has(key)) {
      grouped.set(key, {
        bundle_family: "hpg_channel_bundle",
        bundle_key: `hpg_${periodLabel}_${batch}_${studio}`.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "").toLowerCase(),
        bundle_status: "bundle_candidate_ready",
        customer: "HPG Production",
        studio,
        amount_cents: 0,
        currency,
        memo,
        invoice_date: invoiceDate,
        due_date: dueDate,
        vertical: "Licensing",
        source_file_count: 0,
        source_files: [],
        source_parser_families: new Set(),
        source_report_statuses: new Set(),
        bundle_rule: hpgBundleRule(periodLabel, batch)
      });
    }

    const row = grouped.get(key);
    row.amount_cents += cents;
    row.source_file_count += 1;
    row.source_files.push(parsed.workspacePath);
    row.source_parser_families.add(manifestRow.parser_family);
    row.source_report_statuses.add(String(parsed.result.report?.status ?? ""));
  }

  return Array.from(grouped.values()).map((row) => finalizeBundleRow(row, "HPG source files reconcile individually; this row is a deterministic bundle preview."));
}

function buildAdultTimeBundleRows() {
  const adultTimeFiles = manifest
    .filter((row) => row.include_in_ingestion === "yes")
    .filter((row) => row.processing_role === "primary_source")
    .filter((row) => row.parser_family === "pdf_adulttime_scene")
    .sort((a, b) => Number(a.file_index || 0) - Number(b.file_index || 0));

  if (adultTimeFiles.length === 0) return [];

  const sourceFiles = [];
  const sourceStatuses = new Set();
  let amountCents = 0;
  let currency = "USD";

  for (const manifestRow of adultTimeFiles) {
    const parsed = parseManifestFile(manifestRow);
    const report = parsed.result.normalized_report ?? {};
    const posting = Array.isArray(report.accounting_postings) ? report.accounting_postings[0] : null;
    if (!posting) continue;
    amountCents += toCents(posting.amount?.amount);
    currency = String(posting.amount?.currency ?? report.currency ?? currency);
    sourceFiles.push(parsed.workspacePath);
    sourceStatuses.add(String(parsed.result.report?.status ?? ""));
  }

  const row = {
    bundle_family: "adulttime_pdf_bundle",
    bundle_key: "adulttime_april_2026_exxxtrasmall_bundle",
    bundle_status: "bundle_candidate_review",
    customer: "Gamma Broadcast Group Inc.:Adult Time",
    studio: "Paper Street Media LLC",
    amount_cents: amountCents,
    currency,
    memo: "VOD April 2026",
    invoice_date: "2026-04-30",
    due_date: "2026-06-30",
    vertical: "VOD",
    source_file_count: sourceFiles.length,
    source_files: sourceFiles,
    source_parser_families: new Set(["pdf_adulttime_scene"]),
    source_report_statuses: sourceStatuses,
    bundle_rule: "Sum both April PDF totals; keep review-gated until scene-level Revshare rows are persisted."
  };

  return [finalizeBundleRow(row, "AdultTime matches the Airtable amount only as a two-PDF bundle; source parsers remain review-only.")];
}

function finalizeBundleRow(row, note) {
  const amount = centsToMoney(row.amount_cents);
  const matched = findAirtableMatch({
    customer: row.customer,
    studio: row.studio,
    amount,
    memo: row.memo,
    invoiceDate: row.invoice_date,
    dueDate: row.due_date,
    vertical: row.vertical
  });

  return {
    bundle_family: row.bundle_family,
    bundle_key: row.bundle_key,
    bundle_status: row.bundle_status,
    customer: row.customer,
    studio: row.studio,
    amount,
    currency: row.currency,
    memo: row.memo,
    invoice_date: row.invoice_date,
    due_date: row.due_date,
    vertical: row.vertical,
    source_file_count: String(row.source_file_count),
    source_parser_families: Array.from(row.source_parser_families).sort().join("; "),
    source_report_statuses: Array.from(row.source_report_statuses).sort().join("; "),
    matched_airtable_row: matched ? String(matched.rowNumber) : "",
    matched_airtable_amount: matched?.amount === null || matched?.amount === undefined ? "" : String(matched.amount),
    amount_diff: matched ? (Number(matched.amount) - Number(amount)).toFixed(2) : "",
    comparison_status: matched ? "exact_bundle_match" : "bundle_missing_in_airtable",
    bundle_rule: row.bundle_rule,
    notes: note,
    source_files: row.source_files.join("; ")
  };
}

function findAirtableMatch(output) {
  return airtableRows.find((target) =>
    textKey(target.customer) === textKey(output.customer) &&
    textKey(target.studio) === textKey(output.studio) &&
    textKey(target.memo) === textKey(output.memo) &&
    textKey(target.vertical) === textKey(output.vertical) &&
    target.invoiceDate === output.invoiceDate &&
    target.dueDate === output.dueDate &&
    target.amount !== null &&
    Math.abs(Number(target.amount) - Number(output.amount)) <= 0.01
  ) ?? null;
}

function hpgChannel(row) {
  if (row.parser_family === "xlsx_hpg_canal") return "Canal";
  if (row.parser_family === "xlsx_hpg_netgem") return "Netgem";
  if (row.parser_family === "xlsx_hpg_proximus") return "Proximus";
  const text = `${row.relative_path} ${row.file_name}`.toLowerCase();
  if (text.includes("canal")) return "Canal";
  if (text.includes("netgem")) return "Netgem";
  if (text.includes("proximus")) return "Proximus";
  return "Unknown";
}

function hpgBatch(periodLabel, channel) {
  if (periodLabel === "March 2026" && channel === "Canal") return "Canal";
  if (periodLabel === "March 2026" && ["Netgem", "Proximus"].includes(channel)) return "Netgem+Proximus";
  return "All Channels";
}

function hpgBundleRule(periodLabel, batch) {
  if (periodLabel === "March 2026") {
    return batch === "Canal"
      ? "March 2026 Canal files grouped by canonical studio."
      : "March 2026 Netgem and Proximus files grouped together by canonical studio.";
  }
  return `${periodLabel} Canal, Netgem, and Proximus files grouped together by canonical studio.`;
}

function parseManifestFile(row) {
  const manifestWorkspacePath = normalizeWorkspacePath(path.join("Accounting Project", row.relative_path));
  const absolutePath = fs.existsSync(path.join(root, manifestWorkspacePath))
    ? path.join(root, manifestWorkspacePath)
    : actualFileByHash.get(String(row.sha256).toLowerCase()) ?? path.join(root, manifestWorkspacePath);
  const workspacePath = path.relative(root, absolutePath);
  const bytes = fs.readFileSync(absolutePath);
  const result = parseReportFromBuffer(bytes, workspacePath);
  return { workspacePath, result };
}

function readAirtableRows(filePath) {
  const workbook = XLSX.read(fs.readFileSync(filePath), { type: "buffer", cellDates: false });
  const sheet = workbook.Sheets["Data Entry"];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: null, raw: true });
  return rows.map((row, index) => ({
    rowNumber: index + 2,
    customer: valueOrBlank(row.Customer),
    studio: valueOrBlank(row.Studio),
    amount: numberValue(row.Amount),
    memo: valueOrBlank(row.Memo),
    invoiceDate: excelDate(row["Invoice Date"]),
    dueDate: excelDate(row["Due Date"]),
    vertical: valueOrBlank(row.Vertical)
  }));
}

function compileParser(buildDir) {
  const ts = require("typescript");
  const fileNames = [
    "lib/normalizer/types.ts",
    "lib/normalizer/config.ts",
    "lib/normalizer/classifier.ts",
    "lib/normalizer/dates.ts",
    "lib/normalizer/money.ts",
    "lib/normalizer/readers.ts",
    "lib/normalizer/schema.ts",
    "lib/normalizer/pipeline.ts",
    "lib/normalizer/parsers.ts",
    "lib/parserRunner.ts"
  ].map((file) => path.join(root, file));
  const compilerOptions = {
    module: ts.ModuleKind.CommonJS,
    moduleResolution: ts.ModuleResolutionKind.Node10,
    target: ts.ScriptTarget.ES2022,
    esModuleInterop: true,
    skipLibCheck: true,
    outDir: buildDir,
    noEmit: false,
    noEmitOnError: true,
    strict: true
  };
  const program = ts.createProgram(fileNames, compilerOptions);
  const emitResult = program.emit();
  const diagnostics = ts.getPreEmitDiagnostics(program).concat(emitResult.diagnostics);
  if (diagnostics.length > 0) {
    const formatted = ts.formatDiagnosticsWithColorAndContext(diagnostics, {
      getCanonicalFileName: (fileName) => fileName,
      getCurrentDirectory: () => root,
      getNewLine: () => "\n"
    });
    throw new Error(formatted);
  }
}

function buildActualFileIndex(directory) {
  const indexed = new Map();
  for (const file of walk(directory)) {
    const sha256 = crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
    indexed.set(sha256, file);
  }
  return indexed;
}

function walk(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(fullPath) : [fullPath];
  });
}

function readCsv(file) {
  const text = fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "");
  const rows = parseCsv(text);
  const [headers, ...body] = rows;
  return body
    .filter((row) => row.some((cell) => cell.trim()))
    .map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""])));
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (quoted) {
      if (char === '"' && next === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") field += char;
  }
  row.push(field);
  rows.push(row);
  return rows;
}

function writeCsv(file, rows) {
  if (rows.length === 0) {
    fs.writeFileSync(file, "", "utf8");
    return;
  }
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(","), ...rows.map((row) => headers.map((header) => csvEscape(row[header] ?? "")).join(","))];
  fs.writeFileSync(file, `${lines.join("\n")}\n`, "utf8");
}

function csvEscape(value) {
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function renderMarkdown(rows) {
  const counts = countValues(rows, "comparison_status");
  const byFamily = Array.from(groupBy(rows, "bundle_family").entries()).sort(([a], [b]) => a.localeCompare(b));
  const unmatched = rows.filter((row) => row.comparison_status !== "exact_bundle_match");
  const sampleRows = rows.slice(0, 60);

  return [
    "# Bundle Preview",
    "",
    "Generated by `npm run preview:bundles`. This creates Airtable-shaped bundle rows for reports where one source file cannot truthfully become one Airtable row.",
    "",
    "## Summary",
    "",
    ...Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)).map(([status, count]) => `- ${status}: ${count}`),
    "",
    "## By Bundle Family",
    "",
    "| Bundle family | Rows | Status counts |",
    "| --- | ---: | --- |",
    ...byFamily.map(([family, familyRows]) => `| ${md(family)} | ${familyRows.length} | ${md(formatCounts(countValues(familyRows, "comparison_status")))} |`),
    "",
    "## Preview Rows",
    "",
    "| Family | Customer | Studio | Amount | Memo | Invoice Date | Airtable Row | Status |",
    "| --- | --- | --- | ---: | --- | --- | ---: | --- |",
    ...sampleRows.map((row) => `| ${md(row.bundle_family)} | ${md(row.customer)} | ${md(row.studio)} | ${md(row.amount)} | ${md(row.memo)} | ${md(row.invoice_date)} | ${md(row.matched_airtable_row)} | ${md(row.comparison_status)} |`),
    "",
    unmatched.length === 0 ? "All bundle preview rows matched Airtable exactly." : `Unmatched bundle rows: ${unmatched.length}. See \`docs/bundle_preview.csv\`.`,
    "",
    "Important: bundle preview rows are not yet written into the normal Supabase export view. The current DB export view is single-report based; production export needs a bundle creation step or bundle tables so a bundle can retain provenance from multiple files.",
    ""
  ].join("\n");
}

function groupBy(rows, key) {
  const grouped = new Map();
  for (const row of rows) {
    const value = row[key] || "";
    if (!grouped.has(value)) grouped.set(value, []);
    grouped.get(value).push(row);
  }
  return grouped;
}

function countValues(rows, key) {
  return rows.reduce((acc, row) => {
    const value = row[key] || "(blank)";
    acc[value] = (acc[value] ?? 0) + 1;
    return acc;
  }, {});
}

function formatCounts(counts) {
  return Object.entries(counts)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}:${value}`)
    .join(" ");
}

function numberValue(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(String(value).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? Math.round((parsed + Number.EPSILON) * 100) / 100 : null;
}

function toCents(value) {
  if (value === null || value === undefined || value === "") return 0;
  const parsed = Number(String(value).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? Math.round((parsed + Number.EPSILON) * 100) : 0;
}

function centsToMoney(cents) {
  return (cents / 100).toFixed(2).replace(/\.00$/, "");
}

function excelDate(value) {
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) return "";
    return `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
  }
  return valueOrBlank(value);
}

function valueOrBlank(value) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function textKey(value) {
  return valueOrBlank(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeWorkspacePath(value) {
  return String(value).replaceAll("/", path.sep);
}

function md(value) {
  return String(value ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ").slice(0, 500);
}
