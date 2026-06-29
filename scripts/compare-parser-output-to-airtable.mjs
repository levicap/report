import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import xlsx from "xlsx";

const XLSX = xlsx.default ?? xlsx;
const require = createRequire(import.meta.url);

const root = process.cwd();
const docsDir = path.join(root, "docs");
const outDir = path.join(root, ".tmp", "parser-airtable-compare-build");
const packageDir = path.join(root, "accounting_normalization_package");
const manifestPath = path.join(packageDir, "file_manifest.csv");
const customerLookupPath = path.join(packageDir, "customer_lookup.csv");
const airtablePath = path.join(root, "Accounting Project", "Copy of NMG Airtable Data Entry - This is where you will find processed through Airtable  data.xlsx");
const outputCsv = path.join(docsDir, "parser_output_to_airtable_comparison.csv");
const fileOutputCsv = path.join(docsDir, "parser_file_to_airtable_summary.csv");
const outputMd = path.join(docsDir, "parser_output_to_airtable_comparison.md");

fs.mkdirSync(docsDir, { recursive: true });
fs.mkdirSync(outDir, { recursive: true });

compileParser(outDir);

const { parseReportFromBuffer } = require(path.join(outDir, "parserRunner.js"));
const manifest = readCsv(manifestPath);
const customerAliasesByName = buildCustomerAliases(readCsv(customerLookupPath));
const actualFileByHash = buildActualFileIndex(path.join(root, "Accounting Project"));
const airtableRows = readAirtableRows(airtablePath);

const sampleRows = manifest
  .filter((row) => row.include_in_ingestion === "yes")
  .filter((row) => row.relative_path.startsWith("Sample Reports/"))
  .sort((a, b) => Number(a.file_index || 0) - Number(b.file_index || 0));

const postingComparisons = [];
const fileComparisons = [];

for (const manifestRow of sampleRows) {
  const parsed = parseManifestFile(manifestRow);
  fileComparisons.push(parsed.fileRow);
  postingComparisons.push(...parsed.postingRows);
}

writeCsv(outputCsv, postingComparisons);
writeCsv(fileOutputCsv, fileComparisons);
fs.writeFileSync(outputMd, renderMarkdown(fileComparisons, postingComparisons), "utf8");

console.log(`Compared ${sampleRows.length} sample files`);
console.log(`Compared ${postingComparisons.length} parser postings`);
console.log(`Wrote ${path.relative(root, outputCsv)}`);
console.log(`Wrote ${path.relative(root, fileOutputCsv)}`);
console.log(`Wrote ${path.relative(root, outputMd)}`);
process.exit(0);

function parseManifestFile(row) {
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
    period_hint: row.period_hint,
    parser_family: row.parser_family,
    processing_role: row.processing_role,
    authoritative: row.authoritative,
    expected_status: row.status,
    manifest_notes: row.notes,
    sha256: row.sha256
  };

  try {
    const bytes = fs.readFileSync(absolutePath);
    const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
    const result = parseReportFromBuffer(bytes, workspacePath);
    const report = result.normalized_report ?? {};
    const postings = Array.isArray(report.accounting_postings) ? report.accounting_postings : [];
    const readyPostings = postings.filter((posting) => posting.status === "ready");
    const expectedExport = row.authoritative === "yes" && row.processing_role === "primary_source";
    const postingRows = postings.map((posting, index) => comparePosting(base, result, posting, index, expectedExport));
    const matchCounts = countValues(postingRows, "comparison_status");
    const fileStatus = fileComparisonStatus({
      expectedExport,
      parserStatus: String(result.report?.status ?? ""),
      postingCount: postings.length,
      readyPostingCount: readyPostings.length,
      postingRows
    });

    if (expectedExport && postings.length === 0) {
      postingRows.push({
        ...base,
        report_id: String(result.report?.report_key ?? ""),
        report_status: String(result.report?.status ?? ""),
        validation_status: String(report.validation?.status ?? ""),
        posting_id: "",
        posting_status: "",
        output_customer: "",
        output_studio: "",
        output_amount: "",
        output_currency: String(report.currency ?? ""),
        output_memo: "",
        output_invoice_date: valueOrBlank(report.period?.invoice_date),
        output_due_date: valueOrBlank(report.period?.due_date),
        output_vertical: "",
        comparison_status: "expected_export_but_no_postings",
        match_score: "",
        matched_airtable_row: "",
        matched_customer: "",
        matched_studio: "",
        matched_amount: "",
        matched_memo: "",
        matched_invoice_date: "",
        matched_due_date: "",
        matched_vertical: "",
        amount_diff: "",
        candidate_count: "0",
        closest_amount: "",
        closest_amount_diff: "",
        closest_customer: "",
        closest_studio: "",
        closest_memo: "",
        notes: "Parser produced no accounting postings for an authoritative primary source."
      });
    }

    return {
      fileRow: {
        ...base,
        actual_sha256: sha256,
        hash_match: sha256 === row.sha256 ? "yes" : "no",
        classified_parser_family: String(result.classification?.parser_family ?? ""),
        classification_status: String(result.classification?.status ?? ""),
        report_id: String(result.report?.report_key ?? ""),
        report_status: String(result.report?.status ?? ""),
        review_required: String(result.report?.review_required ?? ""),
        validation_status: String(report.validation?.status ?? ""),
        expected_export: expectedExport ? "yes" : "no",
        posting_count: String(postings.length),
        ready_posting_count: String(readyPostings.length),
        airtable_exact_rows: String(Number(matchCounts.exact_row_match ?? 0)),
        airtable_context_rows: String(Number(matchCounts.context_amount_match ?? 0)),
        airtable_weak_amount_only_rows: String(Number(matchCounts.weak_amount_only_match ?? 0)),
        airtable_missing_rows: String(
          Number(matchCounts.missing_in_airtable ?? 0) +
            Number(matchCounts.customer_period_present_amount_missing ?? 0) +
            Number(matchCounts.expected_export_but_no_postings ?? 0) +
            Number(matchCounts.weak_amount_only_match ?? 0)
        ),
        comparison_status: fileStatus,
        notes: summarizeFileNotes(row, result, postingRows)
      },
      postingRows
    };
  } catch (error) {
    return {
      fileRow: {
        ...base,
        actual_sha256: "",
        hash_match: "no",
        classified_parser_family: "",
        classification_status: "",
        report_id: "",
        report_status: "",
        review_required: "",
        validation_status: "",
        expected_export: row.authoritative === "yes" && row.processing_role === "primary_source" ? "yes" : "no",
        posting_count: "0",
        ready_posting_count: "0",
        airtable_exact_rows: "0",
        airtable_context_rows: "0",
        airtable_weak_amount_only_rows: "0",
        airtable_missing_rows: "0",
        comparison_status: "parse_error",
        notes: error instanceof Error ? error.message : String(error)
      },
      postingRows: [
        {
          ...base,
          report_id: "",
          report_status: "",
          validation_status: "",
          posting_id: "",
          posting_status: "",
          output_customer: "",
          output_studio: "",
          output_amount: "",
          output_currency: "",
          output_memo: "",
          output_invoice_date: "",
          output_due_date: "",
          output_vertical: "",
          comparison_status: "parse_error",
          match_score: "",
          matched_airtable_row: "",
          matched_customer: "",
          matched_studio: "",
          matched_amount: "",
          matched_memo: "",
          matched_invoice_date: "",
          matched_due_date: "",
          matched_vertical: "",
          amount_diff: "",
          candidate_count: "",
          closest_amount: "",
          closest_amount_diff: "",
          closest_customer: "",
          closest_studio: "",
          closest_memo: "",
          notes: error instanceof Error ? error.message : String(error)
        }
      ]
    };
  }
}

function comparePosting(base, result, posting, index, expectedExport) {
  const report = result.normalized_report ?? {};
  const invoiceDate = valueOrBlank(posting.invoice_date ?? report.period?.invoice_date);
  const dueDate = valueOrBlank(posting.due_date ?? addMonths(invoiceDate, 2));
  const output = {
    customer: valueOrBlank(posting.customer),
    studio: valueOrBlank(posting.studio),
    amount: numberValue(posting.amount?.amount),
    currency: valueOrBlank(posting.amount?.currency ?? report.currency),
    memo: valueOrBlank(posting.memo),
    invoiceDate,
    dueDate,
    vertical: valueOrBlank(posting.vertical)
  };

  const scoredTargets = airtableRows.map((target) => scoreTarget(output, target, result.classification?.vendor_name ?? base.vendor));
  const candidates = scoredTargets
    .filter((candidate) => candidate.eligible)
    .sort((a, b) => b.score - a.score || Math.abs(a.amountDiff) - Math.abs(b.amountDiff));
  const weakAmountOnly = scoredTargets
    .filter((candidate) => candidate.amountExact)
    .sort((a, b) => b.score - a.score || Math.abs(a.amountDiff) - Math.abs(b.amountDiff))[0] ?? null;

  const best = candidates[0] ?? null;
  const closest = closestAmount(output, airtableRows, result.classification?.vendor_name ?? base.vendor);
  const comparisonStatus = postingComparisonStatus({
    expectedExport,
    reportStatus: String(result.report?.status ?? ""),
    postingStatus: String(posting.status ?? ""),
    best,
    candidates,
    weakAmountOnly
  });

  return {
    ...base,
    report_id: String(result.report?.report_key ?? ""),
    report_status: String(result.report?.status ?? ""),
    validation_status: String(report.validation?.status ?? ""),
    posting_id: valueOrBlank(posting.posting_id) || `${valueOrBlank(result.report?.report_key)}_posting_${index + 1}`,
    posting_status: valueOrBlank(posting.status),
    output_customer: output.customer,
    output_studio: output.studio,
    output_amount: output.amount === null ? "" : String(output.amount),
    output_currency: output.currency,
    output_memo: output.memo,
    output_invoice_date: output.invoiceDate,
    output_due_date: output.dueDate,
    output_vertical: output.vertical,
    comparison_status: comparisonStatus,
    match_score: best ? String(best.score) : "",
    matched_airtable_row: best ? String(best.target.rowNumber) : "",
    matched_customer: best?.target.customer ?? "",
    matched_studio: best?.target.studio ?? "",
    matched_amount: best?.target.amount === null || best?.target.amount === undefined ? "" : String(best.target.amount),
    matched_memo: best?.target.memo ?? "",
    matched_invoice_date: best?.target.invoiceDate ?? "",
    matched_due_date: best?.target.dueDate ?? "",
    matched_vertical: best?.target.vertical ?? "",
    amount_diff: best ? best.amountDiff.toFixed(6) : "",
    candidate_count: String(candidates.length),
    weak_amount_only_row: weakAmountOnly ? String(weakAmountOnly.target.rowNumber) : "",
    weak_amount_only_customer: weakAmountOnly?.target.customer ?? "",
    weak_amount_only_studio: weakAmountOnly?.target.studio ?? "",
    weak_amount_only_memo: weakAmountOnly?.target.memo ?? "",
    closest_amount: closest?.target.amount === null || closest?.target.amount === undefined ? "" : String(closest?.target.amount ?? ""),
    closest_amount_diff: closest ? closest.amountDiff.toFixed(6) : "",
    closest_customer: closest?.target.customer ?? "",
    closest_studio: closest?.target.studio ?? "",
    closest_memo: closest?.target.memo ?? "",
    notes: postingNotes({ expectedExport, result, posting, best, candidates, weakAmountOnly })
  };
}

function scoreTarget(output, target, vendorName) {
  const amountDiff = output.amount === null || target.amount === null ? Number.POSITIVE_INFINITY : target.amount - output.amount;
  const amountExact = Number.isFinite(amountDiff) && Math.abs(amountDiff) <= 0.02;
  const amountClose = Number.isFinite(amountDiff) && Math.abs(amountDiff) <= 1;
  const customer = customerMatches(output.customer, target.customer, vendorName);
  const studio = studioMatches(output.studio, target.studio);
  const vertical = textKey(output.vertical) && textKey(output.vertical) === textKey(target.vertical);
  const period = periodMatches(output, target);
  const memo = memoOverlaps(output.memo, target.memo);

  let score = 0;
  if (amountExact) score += 50;
  else if (amountClose) score += 20;
  if (customer) score += 25;
  if (studio.exact) score += 20;
  else if (studio.blankOk) score += 8;
  else if (studio.loose) score += 8;
  if (vertical) score += 10;
  if (period) score += 15;
  else if (memo) score += 5;

  const eligible =
    (customer && period) ||
    (customer && amountExact) ||
    (customer && amountClose && period) ||
    (amountExact && studio.exact && Boolean(output.studio));

  return {
    target,
    score,
    eligible,
    amountDiff,
    amountExact,
    customer,
    studioExact: studio.exact,
    studioLoose: studio.loose || studio.blankOk,
    vertical,
    period,
    memo
  };
}

function postingComparisonStatus({ expectedExport, reportStatus, postingStatus, best, candidates, weakAmountOnly }) {
  if (!expectedExport) return "not_expected_to_export";
  if (reportStatus === "blocked") return "blocked_not_exportable";
  if (reportStatus === "review" || postingStatus === "review") return "review_not_exportable";
  if (reportStatus === "suppressed" || postingStatus === "suppressed") return "suppressed_not_exportable";
  if (!best) return weakAmountOnly ? "weak_amount_only_match" : "missing_in_airtable";
  if (best.amountExact && best.customer && best.studioExact && best.vertical && best.period) return "exact_row_match";
  if (best.amountExact && best.customer && best.period) return "context_amount_match";
  if (candidates.some((candidate) => candidate.customer && candidate.period)) return "customer_period_present_amount_missing";
  return weakAmountOnly ? "weak_amount_only_match" : "missing_in_airtable";
}

function fileComparisonStatus({ expectedExport, parserStatus, postingCount, readyPostingCount, postingRows }) {
  if (!expectedExport) return "not_expected_to_export";
  if (parserStatus === "blocked") return "blocked_not_exportable";
  if (parserStatus === "review") return "review_not_exportable";
  if (parserStatus === "suppressed") return "suppressed_not_exportable";
  if (postingCount === 0) return "expected_export_but_no_postings";
  const statuses = countValues(postingRows, "comparison_status");
  const reviewPostings = Number(statuses.review_not_exportable ?? 0) + Number(statuses.blocked_not_exportable ?? 0);
  if (reviewPostings > 0 && Number(statuses.exact_row_match ?? 0) > 0) return "partial_match";
  if (reviewPostings > 0) return "review_not_exportable";
  if (Number(statuses.exact_row_match ?? 0) === readyPostingCount && readyPostingCount > 0) return "all_exact_match";
  if (Number(statuses.exact_row_match ?? 0) + Number(statuses.context_amount_match ?? 0) === readyPostingCount) {
    return "all_amounts_found";
  }
  if (Number(statuses.exact_row_match ?? 0) + Number(statuses.context_amount_match ?? 0) > 0) {
    return "partial_match";
  }
  if (Number(statuses.weak_amount_only_match ?? 0) > 0) return "weak_amount_only_match";
  return "missing_in_airtable";
}

function postingNotes({ expectedExport, result, posting, best, candidates, weakAmountOnly }) {
  if (!expectedExport) return "Source file is supporting, verification, allocation, or otherwise non-authoritative for Airtable export.";
  if (String(result.report?.status ?? "") === "review" || String(posting.status ?? "") === "review") {
    return "Parser routed this report/posting to review; it should not export until approved.";
  }
  if (String(result.report?.status ?? "") === "blocked") return "Parser blocked this report because a business rule/source decision is still missing.";
  if (String(result.report?.status ?? "") === "suppressed" || String(posting.status ?? "") === "suppressed") {
    return "Posting is suppressed, usually because the payable is negative or should carry forward.";
  }
  if (!best && weakAmountOnly) return "Same amount exists somewhere in Airtable, but customer/period context is not strong enough to treat it as a match.";
  if (!best) return "No Airtable row found with enough customer, period, amount, studio, or vertical evidence.";
  if (best.amountExact && best.customer && best.studioExact && best.vertical && best.period) return "Parser row matches Airtable row by amount, customer, studio, vertical, and period.";
  if (best.amountExact && best.customer && best.period) return "Amount is present in Airtable for the same customer/period; studio, vertical, or memo differs.";
  if (candidates.some((candidate) => candidate.customer && candidate.period)) return "Airtable has customer/period rows, but none with the parser amount.";
  return "Closest Airtable candidate is weak; likely missing or mapping/memo differs.";
}

function summarizeFileNotes(row, result, postingRows) {
  const issues = result.normalized_report?.validation?.issues;
  const issueText = Array.isArray(issues) && issues.length > 0 ? issues.slice(0, 5).join("; ") : "";
  if (row.authoritative !== "yes" || row.processing_role !== "primary_source") {
    return "Not authoritative for Airtable export. " + (row.notes || "");
  }
  const statuses = countValues(postingRows, "comparison_status");
  if (statuses.exact_row_match && Number(statuses.exact_row_match) === postingRows.length) return "All parser postings match Airtable exactly.";
  if (issueText) return issueText;
  return row.notes || "";
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
    vertical: valueOrBlank(row.Vertical),
    invoiceNumber: valueOrBlank(row["Antoinette or Val Invoice#"])
  }));
}

function customerMatches(outputCustomer, targetCustomer, vendorName) {
  const target = textKey(targetCustomer);
  if (!target) return false;
  const aliases = new Set([outputCustomer, vendorName].flatMap((name) => customerAliases(name)));
  return Array.from(aliases).some((alias) => alias === target || alias.includes(target) || target.includes(alias));
}

function customerAliases(value) {
  const key = textKey(value);
  if (!key) return [];
  const aliases = new Set([key]);
  const lookup = customerAliasesByName.get(key);
  if (lookup) {
    lookup.forEach((alias) => aliases.add(alias));
  }
  if (key.includes("gamma broadcast group inc adult time")) aliases.add("gamma broadcast group inc");
  if (key.includes("gamma broadcast group inc licensing")) aliases.add("gamma broadcast group inc");
  if (key.includes("erigo load")) aliases.add("erigo");
  if (key.includes("dusk tv 2grapesmedia")) aliases.add("dusk tv 2grapesmedia bv");
  return Array.from(aliases);
}

function buildCustomerAliases(rows) {
  const aliases = new Map();
  for (const row of rows) {
    const values = [row.source_customer_name, row.canonical_billing_customer].map(textKey).filter(Boolean);
    for (const value of values) {
      if (!aliases.has(value)) aliases.set(value, new Set());
      values.forEach((alias) => aliases.get(value).add(alias));
    }
  }
  return aliases;
}

function studioMatches(outputStudio, targetStudio) {
  const output = textKey(outputStudio);
  const target = textKey(targetStudio);
  if (!output && !target) return { exact: true, loose: false, blankOk: true };
  if (!output || !target) return { exact: false, loose: false, blankOk: !output };
  if (output === target) return { exact: true, loose: true, blankOk: false };
  return {
    exact: false,
    loose: output.includes(target) || target.includes(output),
    blankOk: false
  };
}

function periodMatches(output, target) {
  const outputTokens = periodTokens([output.memo, output.invoiceDate].join(" "));
  const targetTokens = periodTokens([target.memo, target.invoiceDate].join(" "));
  if (outputTokens.size === 0 || targetTokens.size === 0) return false;
  for (const token of outputTokens) {
    if (targetTokens.has(token)) return true;
  }
  return false;
}

function memoOverlaps(outputMemo, targetMemo) {
  const output = new Set(textKey(outputMemo).split(" ").filter((word) => word.length > 2));
  const target = new Set(textKey(targetMemo).split(" ").filter((word) => word.length > 2));
  let overlap = 0;
  for (const word of output) {
    if (target.has(word)) overlap += 1;
  }
  return overlap >= 2;
}

function periodTokens(value) {
  const text = textKey(value);
  const tokens = new Set();
  const months = [
    ["01", "january", "jan"],
    ["02", "february", "feb"],
    ["03", "march", "mar"],
    ["04", "april", "apr"],
    ["05", "may", "may"],
    ["06", "june", "jun"],
    ["07", "july", "jul"],
    ["08", "august", "aug"],
    ["09", "september", "sep"],
    ["10", "october", "oct"],
    ["11", "november", "nov"],
    ["12", "december", "dec"]
  ];
  for (const [number, full, short] of months) {
    if (text.includes(`${full} 2026`) || text.includes(`${short} 2026`) || text.includes(`2026 ${number}`) || text.includes(`2026-${number}`)) {
      tokens.add(`2026-${number}`);
    }
  }
  for (const match of text.matchAll(/2026 q([1-4])|q([1-4]) 2026|quarter ([1-4])/g)) {
    tokens.add(`2026-q${match[1] || match[2] || match[3]}`);
  }
  if (text.includes("january to march") || text.includes("jan to mar") || text.includes("q1")) tokens.add("2026-q1");
  if (text.includes("april and may") || text.includes("march april and may")) {
    tokens.add("2026-04");
    tokens.add("2026-05");
  }
  return tokens;
}

function closestAmount(output, rows, vendorName) {
  if (output.amount === null) return null;
  return rows
    .map((target) => ({
      target,
      amountDiff: target.amount === null ? Number.POSITIVE_INFINITY : target.amount - output.amount,
      customer: customerMatches(output.customer, target.customer, vendorName)
    }))
    .filter((candidate) => Number.isFinite(candidate.amountDiff))
    .sort((a, b) => {
      if (a.customer !== b.customer) return a.customer ? -1 : 1;
      return Math.abs(a.amountDiff) - Math.abs(b.amountDiff);
    })[0] ?? null;
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

function renderMarkdown(fileRows, postingRows) {
  const fileCounts = countValues(fileRows, "comparison_status");
  const postingCounts = countValues(postingRows, "comparison_status");
  const byParserFamily = Array.from(groupBy(fileRows, "parser_family").entries()).sort(([a], [b]) => a.localeCompare(b));
  const missing = postingRows
    .filter((row) => ["missing_in_airtable", "customer_period_present_amount_missing", "expected_export_but_no_postings", "weak_amount_only_match"].includes(row.comparison_status))
    .slice(0, 40);

  return [
    "# Parser Output To NMG Airtable Comparison",
    "",
    "Generated by `npm run compare:airtable`. This parses the real sample files with the current parser functions, then compares generated Airtable-shaped postings to the NMG Airtable `Data Entry` sheet.",
    "",
    "## File Summary",
    "",
    ...Object.entries(fileCounts).sort(([a], [b]) => a.localeCompare(b)).map(([status, count]) => `- ${status}: ${count}`),
    "",
    "## Posting Summary",
    "",
    ...Object.entries(postingCounts).sort(([a], [b]) => a.localeCompare(b)).map(([status, count]) => `- ${status}: ${count}`),
    "",
    "## By Parser Family",
    "",
    "| Parser family | Files | File statuses | Postings | Posting statuses |",
    "| --- | ---: | --- | ---: | --- |",
    ...byParserFamily.map(([family, rows]) => {
      const paths = new Set(rows.map((row) => row.workspace_path));
      const relatedPostings = postingRows.filter((row) => paths.has(row.workspace_path));
      return `| ${md(family)} | ${rows.length} | ${md(formatCounts(countValues(rows, "comparison_status")))} | ${relatedPostings.length} | ${md(formatCounts(countValues(relatedPostings, "comparison_status")))} |`;
    }),
    "",
    "## Missing Or Weak Matches",
    "",
    missing.length === 0
      ? "No expected export postings are missing from Airtable by the current matching rules."
      : [
          "| File | Parser family | Customer | Studio | Amount | Memo | Status | Closest Airtable row | Closest amount | Notes |",
          "| --- | --- | --- | --- | ---: | --- | --- | ---: | ---: | --- |",
          ...missing.map((row) => `| ${md(row.file_name)} | ${md(row.parser_family)} | ${md(row.output_customer)} | ${md(row.output_studio)} | ${md(row.output_amount)} | ${md(row.output_memo)} | ${md(row.comparison_status)} | ${md(row.matched_airtable_row)} | ${md(row.closest_amount)} | ${md(row.notes)} |`)
        ].join("\n"),
    "",
    "Detailed rows: `docs/parser_output_to_airtable_comparison.csv`.",
    "Per-file rollup: `docs/parser_file_to_airtable_summary.csv`.",
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

function numberValue(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(String(value).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? Math.round((parsed + Number.EPSILON) * 100) / 100 : null;
}

function excelDate(value) {
  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) return "";
    return `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
  }
  return valueOrBlank(value);
}

function addMonths(value, months) {
  if (!value) return "";
  const [yearText, monthText, dayText] = String(value).split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return "";
  const target = new Date(Date.UTC(year, month - 1 + months, 1));
  const targetYear = target.getUTCFullYear();
  const targetMonth = target.getUTCMonth();
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  const targetDay = Math.min(day, lastDay);
  return `${targetYear}-${String(targetMonth + 1).padStart(2, "0")}-${String(targetDay).padStart(2, "0")}`;
}

function valueOrBlank(value) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function textKey(value) {
  return valueOrBlank(value)
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\b(llc|inc|bv|b v|gmbh|slu|s l u)\b/g, (match) => match)
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeWorkspacePath(value) {
  return String(value).replaceAll("/", path.sep);
}

function md(value) {
  return String(value ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ").slice(0, 500);
}
