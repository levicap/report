import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const root = process.cwd();
const require = createRequire(import.meta.url);
const outDir = path.join(root, ".tmp", "analytics-unified-build");
const manifestPath = path.join(root, "accounting_normalization_package", "file_manifest.csv");
const onePerFamily = process.argv.includes("--one-per-family");
const familyFilter = optionValue("--family");

const clients = new Map([
  ["xlsx_1979_dorcel", client("1979_media", "1979 Media / Dorcel", "xlsx_1979_dorcel", "Licensing", "EUR")],
  ["xlsx_aerona_rollup", client("aerona", "AERONA / ADE", "xlsx_aerona_rollup", "VOD", "USD")],
  ["xlsx_amg_mixed", client("amg", "All Media Group / AMG", "xlsx_amg_mixed", "Licensing", "USD")],
  ["xlsx_av_royalty_header", client("av_entertainment", "AV Entertainment / Optical Xtreme", "xlsx_av_royalty_header", "VOD", "USD")],
  ["xlsx_bell_canada_payment", client("bell_canada", "Bell Canada", "xlsx_bell_canada_payment", "Licensing", null)],
  ["pdf_invoice_lines", client("dream_logistics", "Dream Logistics BV", "pdf_invoice_lines", "VOD", "USD")],
  ["xlsx_dusk_playlist", client("dusk", "Dusk TV / 2GrapesMedia", "xlsx_dusk_playlist", "Licensing", "EUR")],
  ["pdf_payment_narrative", client("erigo", "Erigo / Load", "pdf_payment_narrative", "DVD", "USD")],
  ["xlsx_erika_summary", client("erika_lust", "Erika Lust / Lust Productions", "xlsx_erika_summary", "Licensing", "EUR")],
  ["xlsx_gamma_running_balance", client("gamma_licensing", "Gamma Broadcast Group Licensing", "xlsx_gamma_running_balance", "Licensing", "USD")],
  ["pdf_adulttime_scene", client("gamma_adult_time", "Gamma AdultTime", "pdf_adulttime_scene", "VOD", "USD")],
  ["xlsx_girlfriends_quickbooks", client("girlfriends_films", "Girlfriends Films", "xlsx_girlfriends_quickbooks", "DVD", "USD")],
  ["xlsx_hpg_canal", client("hpg_canal", "HPG Canal / Orange", "xlsx_hpg_canal", "Licensing", "EUR")],
  ["xlsx_hpg_netgem", client("hpg_netgem", "HPG Netgem", "xlsx_hpg_netgem", "Licensing", "EUR")],
  ["xlsx_hpg_proximus", client("hpg_proximus", "HPG Proximus", "xlsx_hpg_proximus", "Licensing", "EUR")],
  ["xlsx_knpb_credit_note", client("knpb", "KNPB Media / DVD Erotik", "xlsx_knpb_credit_note", "VOD", "EUR")],
  ["pdf_level5_credit_note", client("level5", "Level5 Media / Veegaz", "pdf_level5_credit_note", "VOD", "EUR")],
  ["xlsx_new_sensations_paid", client("new_sensations", "New Sensations", "xlsx_new_sensations_paid", "DVD", "USD")],
  ["xlsx_embedded_image_omnet", client("omnet", "OMNet / Orgazmik", "xlsx_embedded_image_omnet", "VOD", "EUR")],
  ["xlsx_pulse_cumulative_balance", client("pulse", "Pulse Distribution", "xlsx_pulse_cumulative_balance", "DVD", "USD")],
  ["docx_sonifi_statement", client("sonifi", "Sonifi Solutions", "docx_sonifi_statement", "VOD", "USD")],
  ["xlsx_velvet_rfi_specs", client("velvet_media", "Velvet Media", "xlsx_velvet_rfi_specs", "Licensing", "EUR")],
  ["xlsx_aebn_title", client("aebn", "WMM Holdings / AEBN", "xlsx_aebn_title", "VOD", "USD")]
]);

const textFields = [
  "line_id",
  "source_line_id",
  "vendor",
  "report_family",
  "customer",
  "title",
  "source_title_id",
  "source_studio",
  "canonical_studio",
  "source_customer",
  "platform",
  "territory",
  "product_type",
  "currency",
  "period_start",
  "period_end"
];

const numberFields = [
  "line_index",
  "quantity",
  "gross_amount",
  "fee_amount",
  "expense_amount",
  "net_amount",
  "royalty_amount",
  "royalty_rate",
  "sales_count",
  "download_count",
  "rental_count",
  "stream_count",
  "duration_seconds"
];

fs.mkdirSync(outDir, { recursive: true });
compileAnalytics(outDir);

const { parseReportFromBufferForClient } = require(path.join(outDir, "parserRunner.js"));
const { buildAnalyticsCanonicalReport, extractRawTables } = require(path.join(outDir, "analyticsFormat.js"));

let rows = readCsv(manifestPath)
  .filter((row) => row.include_in_ingestion === "yes")
  .filter((row) => row.processing_role === "primary_source")
  .filter((row) => clients.has(row.parser_family))
  .filter((row) => !familyFilter || row.parser_family === familyFilter)
  .sort((left, right) => String(left.parser_family).localeCompare(String(right.parser_family)) || String(left.relative_path).localeCompare(String(right.relative_path)));

if (onePerFamily) {
  const seen = new Set();
  rows = rows.filter((row) => {
    if (seen.has(row.parser_family)) return false;
    seen.add(row.parser_family);
    return true;
  });
}

const fileIndex = new Map();
const results = rows.map((row) => verifyRow(row));
printResults(results);

if (results.some((result) => result.error || result.issues.length > 0)) {
  process.exitCode = 1;
}
process.exit(process.exitCode ?? 0);

function verifyRow(row) {
  const parserFamily = row.parser_family;
  const selectedClient = clients.get(parserFamily);
  const filePath = resolveSamplePath(row);
  const relativePath = path.relative(root, filePath);
  const base = {
    parser_family: parserFamily,
    file: relativePath,
    status: "",
    line_count: 0,
    total: "",
    currency: "",
    missing: {},
    issues: [],
    error: ""
  };

  try {
    const bytes = fs.readFileSync(filePath);
    const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
    const parserResult = parseReportFromBufferForClient(bytes, relativePath, selectedClient);
    const rawTables = extractRawTables(bytes, row.file_name || path.basename(filePath));
    const canonical = buildAnalyticsCanonicalReport(parserResult, selectedClient, row.file_name || path.basename(filePath), sha256, rawTables);
    const issues = validateCanonical(canonical);
    return {
      ...base,
      status: canonical.report.status,
      line_count: canonical.line_items.length,
      total: canonical.totals.line_items_total ?? canonical.totals.source_total ?? "",
      currency: canonical.totals.currency ?? canonical.currency ?? "",
      missing: missingCounts(canonical.line_items),
      issues
    };
  } catch (error) {
    return {
      ...base,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

function validateCanonical(canonical) {
  const issues = [];
  canonical.line_items.forEach((line, index) => {
    for (const field of textFields) {
      const value = line[field];
      if (value === null || value === undefined) continue;
      if (typeof value === "object") {
        issues.push(`line ${index + 1} ${field} is object`);
      } else if (String(value).includes("[object Object]")) {
        issues.push(`line ${index + 1} ${field} rendered [object Object]`);
      }
    }

    for (const field of numberFields) {
      const value = line[field];
      if (value === null || value === undefined) continue;
      if (typeof value !== "number" || !Number.isFinite(value)) {
        issues.push(`line ${index + 1} ${field} is not a finite number`);
      }
    }

    if (!line.raw_fields || typeof line.raw_fields !== "object" || Array.isArray(line.raw_fields)) {
      issues.push(`line ${index + 1} raw_fields is not an object`);
    }
    if (!line.source_location || typeof line.source_location !== "object" || Array.isArray(line.source_location)) {
      issues.push(`line ${index + 1} source_location is not an object`);
    }
  });

  for (const field of ["source_total", "line_items_total", "postings_total", "difference"]) {
    const value = canonical.totals[field];
    if (value !== null && value !== undefined && (typeof value !== "number" || !Number.isFinite(value))) {
      issues.push(`totals.${field} is not a finite number`);
    }
  }

  return Array.from(new Set(issues)).slice(0, 20);
}

function missingCounts(lines) {
  const fields = ["vendor", "report_family", "customer", "title", "source_studio", "canonical_studio", "platform", "product_type", "net_amount", "currency"];
  return Object.fromEntries(fields.map((field) => [field, lines.filter((line) => line[field] === null || line[field] === undefined || line[field] === "" || line[field] === "[object Object]").length]));
}

function printResults(results) {
  const failed = results.filter((result) => result.error || result.issues.length > 0);
  const grouped = groupBy(results, "parser_family");
  console.log(`Unified analytics parser verification`);
  console.log(`Files tested: ${results.length}`);
  console.log(`Failures: ${failed.length}`);
  console.log(`Mode: ${onePerFamily ? "one file per parser family" : "all manifest primary source files"}`);
  console.log("");
  for (const [family, familyRows] of Array.from(grouped.entries()).sort(([a], [b]) => a.localeCompare(b))) {
    const issueCount = familyRows.reduce((sum, row) => sum + row.issues.length + (row.error ? 1 : 0), 0);
    const lines = familyRows.reduce((sum, row) => sum + row.line_count, 0);
    console.log(`- ${family}: ${familyRows.length} files, ${lines} lines, issues ${issueCount}`);
    for (const row of familyRows.filter((item) => item.error || item.issues.length > 0).slice(0, 3)) {
      console.log(`  ${row.file}`);
      if (row.error) console.log(`    error: ${row.error}`);
      for (const issue of row.issues.slice(0, 5)) console.log(`    issue: ${issue}`);
    }
  }
}

function resolveSamplePath(row) {
  const direct = path.join(root, "Accounting Project", row.relative_path);
  if (fs.existsSync(direct)) return direct;

  const byHash = sampleFileIndex().get(String(row.sha256).toLowerCase());
  if (byHash) return byHash;

  throw new Error(`Sample file not found: ${row.relative_path}`);
}

function sampleFileIndex() {
  if (fileIndex.size > 0) return fileIndex;
  for (const directory of ["Accounting Project", "reportss samples"]) {
    const absolute = path.join(root, directory);
    if (!fs.existsSync(absolute)) continue;
    for (const file of walk(absolute)) {
      const sha256 = crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex").toLowerCase();
      fileIndex.set(sha256, file);
    }
  }
  return fileIndex;
}

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(fullPath) : [fullPath];
  });
}

function compileAnalytics(buildDir) {
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
    "lib/parserRunner.ts",
    "lib/analyticsFormat.ts"
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
    throw new Error(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
      getCanonicalFileName: (fileName) => fileName,
      getCurrentDirectory: () => root,
      getNewLine: () => "\n"
    }));
  }
}

function client(clientKey, displayName, parserFamily, vertical, currency) {
  return {
    id: clientKey,
    client_key: clientKey,
    display_name: displayName,
    parser_family: parserFamily,
    vertical,
    currency
  };
}

function optionValue(name) {
  const prefix = `${name}=`;
  return process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length) ?? null;
}

function groupBy(items, key) {
  const grouped = new Map();
  for (const item of items) {
    const value = item[key] || "";
    if (!grouped.has(value)) grouped.set(value, []);
    grouped.get(value).push(item);
  }
  return grouped;
}

function readCsv(filePath) {
  const rows = parseCsv(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
  const [headers, ...body] = rows;
  return body
    .filter((row) => row.some((value) => value.trim() !== ""))
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
    } else if (char !== "\r") {
      field += char;
    }
  }
  row.push(field);
  rows.push(row);
  return rows;
}
