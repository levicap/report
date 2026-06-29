import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const root = process.cwd();
const outDir = path.join(root, ".tmp", "parser-fixture-build");
const docsDir = path.join(root, "docs");
const packageDir = path.join(root, "accounting_normalization_package");
const manifestPath = path.join(packageDir, "file_manifest.csv");
const outputPath = path.join(docsDir, "parser_fixture_results.csv");
const mappingOutputPath = path.join(docsDir, "parser_mapping_results.csv");
const sampleOutputPath = path.join(docsDir, "parser_family_sample_outputs.json");
const summaryOutputPath = path.join(docsDir, "parser_function_test_summary.md");
const strict = process.argv.includes("--strict");
const includeReviewOnly = process.argv.includes("--include-review-only");
const require = createRequire(import.meta.url);

fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync(docsDir, { recursive: true });

compileParser(outDir);

const { parseReportFromBuffer } = require(path.join(outDir, "parserRunner.js"));
const manifest = readCsv(manifestPath);
const actualFileByHash = buildActualFileIndex(path.join(root, "Accounting Project"));
const sourceRows = manifest
  .filter((row) => row.include_in_ingestion === "yes")
  .filter((row) => includeReviewOnly || row.processing_role === "primary_source")
  .sort((a, b) => String(a.workspace_path).localeCompare(String(b.workspace_path)));

const sampleOutputsByFamily = new Map();
const results = sourceRows.map((row) => runFixture(row, parseReportFromBuffer));
writeCsv(outputPath, results);
writeCsv(mappingOutputPath, mappingRows(results));
fs.writeFileSync(sampleOutputPath, `${JSON.stringify(Object.fromEntries(sampleOutputsByFamily), null, 2)}\n`, "utf8");
fs.writeFileSync(summaryOutputPath, buildMarkdownSummary(results), "utf8");
printSummary(results);

const parseErrors = results.filter((row) => row.error);
const schemaFailures = results.filter((row) => Number(row.schema_failed_count) > 0);
if (parseErrors.length > 0 || (strict && schemaFailures.length > 0)) {
  process.exitCode = 1;
}
process.exit(process.exitCode ?? 0);

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

function runFixture(row, parser) {
  const manifestWorkspacePath = normalizeWorkspacePath(path.join("Accounting Project", row.relative_path));
  const absolutePath = fs.existsSync(path.join(root, manifestWorkspacePath))
    ? path.join(root, manifestWorkspacePath)
    : actualFileByHash.get(String(row.sha256).toLowerCase()) ?? path.join(root, manifestWorkspacePath);
  const workspacePath = path.relative(root, absolutePath);
  const base = {
    workspace_path: workspacePath,
    file_name: row.file_name,
    vendor_id: row.vendor_id,
    vendor: row.vendor,
    parser_family: row.parser_family,
    processing_role: row.processing_role,
    expected_action: row.expected_action,
    sha256: row.sha256,
    hash_match: "no",
    parser_function: parserFunctionForFamily(row.parser_family),
    classified_parser_family: "",
    classification_status: "",
    classifier_confidence: "",
    mapping_match: "no",
    report_status: "",
    review_required: "",
    validation_status: "",
    record_count: "0",
    posting_count: "0",
    line_item_count: "0",
    normalized_total: "",
    currency: "",
    schema_failed_count: "0",
    failed_checks: "",
    error: ""
  };

  try {
    const bytes = fs.readFileSync(absolutePath);
    const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
    const result = parser(bytes, workspacePath);
    const postings = Array.isArray(result.normalized_report.accounting_postings) ? result.normalized_report.accounting_postings : [];
    const lineItems = Array.isArray(result.normalized_report.line_items) ? result.normalized_report.line_items : [];
    const schemaFailures = result.validation_results.filter((item) => item.check_name === "json_schema" && item.status === "failed");
    const failedChecks = result.validation_results.filter((item) => item.status === "failed").map((item) => item.check_name);
    const amount = result.normalized_report.financial_summary?.net_payable?.amount
      ?? result.normalized_report.validation?.computed_total?.amount
      ?? result.normalized_report.validation?.declared_total?.amount
      ?? "";

    const fixtureResult = {
      ...base,
      hash_match: sha256 === row.sha256 ? "yes" : "no",
      parser_function: parserFunctionForFamily(String(result.classification.parser_family ?? row.parser_family)),
      classified_parser_family: String(result.classification.parser_family ?? ""),
      classification_status: String(result.classification.status ?? ""),
      classifier_confidence: String(result.classification.confidence ?? ""),
      mapping_match: result.classification.parser_family === row.parser_family ? "yes" : "no",
      report_status: String(result.report.status ?? ""),
      review_required: String(result.report.review_required ?? ""),
      validation_status: String(result.normalized_report.validation?.status ?? ""),
      record_count: String(result.records.length),
      posting_count: String(postings.length),
      line_item_count: String(lineItems.length),
      normalized_total: String(amount),
      currency: String(result.normalized_report.currency ?? ""),
      schema_failed_count: String(schemaFailures.length),
      failed_checks: Array.from(new Set(failedChecks)).join("; ")
    };
    captureFamilySample(result, workspacePath, base.parser_family);
    return fixtureResult;
  } catch (error) {
    return {
      ...base,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

function printSummary(results) {
  const byFamily = groupBy(results, "parser_family");
  const parseErrors = results.filter((row) => row.error).length;
  const schemaFailures = results.filter((row) => Number(row.schema_failed_count) > 0).length;
  const mappingMismatches = results.filter((row) => row.mapping_match !== "yes").length;
  const ready = results.filter((row) => row.report_status === "ready").length;
  const review = results.filter((row) => row.report_status === "review").length;
  const blocked = results.filter((row) => row.report_status === "blocked").length;
  const suppressed = results.filter((row) => row.report_status === "suppressed").length;

  console.log(`Parser fixture files: ${results.length}`);
  console.log(`Ready: ${ready}; review: ${review}; blocked: ${blocked}; suppressed: ${suppressed}`);
  console.log(`Parse errors: ${parseErrors}; schema failure files: ${schemaFailures}; mapping mismatches: ${mappingMismatches}`);
  console.log(`Wrote ${path.relative(root, outputPath)}`);
  console.log(`Wrote ${path.relative(root, mappingOutputPath)}`);
  console.log(`Wrote ${path.relative(root, sampleOutputPath)}`);
  console.log(`Wrote ${path.relative(root, summaryOutputPath)}`);
  console.log("");
  console.log("Family summary:");
  for (const [family, rows] of Array.from(byFamily.entries()).sort(([a], [b]) => a.localeCompare(b))) {
    const familyErrors = rows.filter((row) => row.error).length;
    const familySchemaFailures = rows.filter((row) => Number(row.schema_failed_count) > 0).length;
    const statuses = countValues(rows, "report_status");
    console.log(`- ${family}: ${rows.length} files, statuses ${formatCounts(statuses)}, errors ${familyErrors}, schema failures ${familySchemaFailures}`);
  }
}

function captureFamilySample(result, workspacePath, expectedParserFamily) {
  const family = String(result.classification.parser_family || expectedParserFamily);
  if (sampleOutputsByFamily.has(family)) {
    return;
  }

  const lineItems = Array.isArray(result.normalized_report.line_items) ? result.normalized_report.line_items : [];
  const postings = Array.isArray(result.normalized_report.accounting_postings) ? result.normalized_report.accounting_postings : [];
  sampleOutputsByFamily.set(family, {
    parser_family: family,
    parser_function: parserFunctionForFamily(family),
    sample_file: workspacePath,
    classification: {
      vendor_id: result.classification.vendor_id,
      vendor_name: result.classification.vendor_name,
      parser_family: result.classification.parser_family,
      status: result.classification.status,
      confidence: result.classification.confidence,
      reason: result.classification.reason
    },
    report: result.report,
    validation: result.normalized_report.validation,
    totals: {
      gross_sales: result.normalized_report.financial_summary?.gross_sales ?? null,
      period_royalty_earned: result.normalized_report.financial_summary?.period_royalty_earned ?? null,
      fees: result.normalized_report.financial_summary?.fees ?? null,
      expenses: result.normalized_report.financial_summary?.expenses ?? null,
      net_payable: result.normalized_report.financial_summary?.net_payable ?? null
    },
    counts: {
      records: result.records.length,
      line_items: lineItems.length,
      postings: postings.length,
      provenance: result.field_provenance.length,
      validation_results: result.validation_results.length,
      review_items: result.review_items.length
    },
    first_line_items: lineItems.slice(0, 2),
    first_accounting_postings: postings.slice(0, 2),
    field_provenance_sample: result.field_provenance.slice(0, 5),
    validation_results_sample: result.validation_results.slice(0, 10),
    review_reasons: result.review_items.slice(0, 5).map((item) => item.reason)
  });
}

function mappingRows(results) {
  return results.map((row) => ({
    workspace_path: row.workspace_path,
    file_name: row.file_name,
    sha256: row.sha256,
    expected_parser_family: row.parser_family,
    classified_parser_family: row.classified_parser_family,
    parser_function: row.parser_function,
    classification_status: row.classification_status,
    classifier_confidence: row.classifier_confidence,
    hash_match: row.hash_match,
    mapping_match: row.mapping_match,
    error: row.error
  }));
}

function buildMarkdownSummary(results) {
  const byFamily = Array.from(groupBy(results, "parser_family").entries()).sort(([a], [b]) => a.localeCompare(b));
  const byFunction = Array.from(groupBy(results, "parser_function").entries()).sort(([a], [b]) => a.localeCompare(b));
  const lines = [
    "# Parser Function Fixture Summary",
    "",
    "Generated by `npm run test:parsers` from the real `Accounting Project` sample files.",
    "",
    "## Totals",
    "",
    `- Files tested: ${results.length}`,
    `- Mapping mismatches: ${results.filter((row) => row.mapping_match !== "yes").length}`,
    `- Parse errors: ${results.filter((row) => row.error).length}`,
    `- Schema failure files: ${results.filter((row) => Number(row.schema_failed_count) > 0).length}`,
    `- Ready reports: ${results.filter((row) => row.report_status === "ready").length}`,
    `- Review reports: ${results.filter((row) => row.report_status === "review").length}`,
    `- Blocked reports: ${results.filter((row) => row.report_status === "blocked").length}`,
    `- Suppressed reports: ${results.filter((row) => row.report_status === "suppressed").length}`,
    "",
    "## Parser Functions",
    "",
    "| Parser function | Files | Parser families | Status counts | Mapping mismatches |",
    "| --- | ---: | --- | --- | ---: |",
    ...byFunction.map(([parserFunction, rows]) => {
      const families = Array.from(new Set(rows.map((row) => row.parser_family))).sort().join(", ");
      return `| ${md(parserFunction)} | ${rows.length} | ${md(families)} | ${md(formatCounts(countValues(rows, "report_status")))} | ${rows.filter((row) => row.mapping_match !== "yes").length} |`;
    }),
    "",
    "## Parser Families",
    "",
    "| Parser family | Parser function | Files | Status counts | Schema failures | Sample output |",
    "| --- | --- | ---: | --- | ---: | --- |",
    ...byFamily.map(([family, rows]) => {
      const sample = sampleOutputsByFamily.has(family) ? "`parser_family_sample_outputs.json`" : "";
      return `| ${md(family)} | ${md(parserFunctionForFamily(family))} | ${rows.length} | ${md(formatCounts(countValues(rows, "report_status")))} | ${rows.filter((row) => Number(row.schema_failed_count) > 0).length} | ${sample} |`;
    }),
    "",
    "Detailed mapping checks are in `docs/parser_mapping_results.csv`.",
    "Detailed fixture results are in `docs/parser_fixture_results.csv`.",
    "Compact normalized output examples are in `docs/parser_family_sample_outputs.json`.",
    ""
  ];
  return lines.join("\n");
}

function parserFunctionForFamily(parserFamily) {
  if (parserFamily === "xlsx_1979_dorcel") return "parse1979Dorcel";
  if (parserFamily === "xlsx_aerona_rollup") return "parseAeronaRollup";
  if (["xlsx_hpg_canal", "xlsx_hpg_netgem", "xlsx_hpg_proximus"].includes(parserFamily)) return "parseHpgWorkbook";
  if (parserFamily === "xlsx_aebn_title") return "parseAebnTitleWorkbook";
  if (parserFamily === "xlsx_new_sensations_paid") return "parseNewSensationsWorkbook";
  if (parserFamily === "xlsx_girlfriends_quickbooks") return "parseGirlfriendsWorkbook";
  if (parserFamily === "xlsx_dusk_playlist") return "parseDuskWorkbook";
  if (parserFamily === "xlsx_av_royalty_header") return "parseAvWorkbook";
  if (parserFamily === "xlsx_erika_summary") return "parseProducerPivotWorkbook";
  if (parserFamily === "xlsx_gamma_running_balance") return "parseGammaWorkbook";
  if (parserFamily === "xlsx_pulse_cumulative_balance") return "parsePulseWorkbook";
  if (parserFamily === "xlsx_knpb_credit_note") return "parseKnpbWorkbook";
  if (parserFamily === "xlsx_amg_mixed") return "parseAmgWorkbook";
  if (["pdf_invoice_lines", "pdf_payment_narrative", "pdf_adulttime_scene", "pdf_level5_credit_note", "xlsx_embedded_image_omnet", "docx_sonifi_statement"].includes(parserFamily)) {
    return "parseKnownDocumentSample";
  }
  return "buildReviewResult";
}

function normalizeWorkspacePath(value) {
  return String(value).replaceAll("/", path.sep);
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
  if (!fs.existsSync(directory)) {
    return [];
  }
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(fullPath) : [fullPath];
  });
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
  const counts = new Map();
  for (const row of rows) {
    const value = row[key] || "(blank)";
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return counts;
}

function formatCounts(counts) {
  return Array.from(counts.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}:${value}`)
    .join(" ");
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

function md(value) {
  return String(value ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ").slice(0, 500);
}
