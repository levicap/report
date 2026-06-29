import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";

const root = process.cwd();
const accountingProject = path.join(root, "Accounting Project");
const sampleRoot = path.join(accountingProject, "Sample Reports");
const packageRoot = path.join(root, "accounting_normalization_package");
const docsRoot = path.join(root, "docs");

const manifest = readCsv(path.join(packageRoot, "file_manifest.csv"));
const reportGroups = readCsv(path.join(packageRoot, "report_group_audit.csv"));
const vendorConfig = JSON.parse(fs.readFileSync(path.join(packageRoot, "vendor_mapping_config.json"), "utf8"));
const anomalies = readCsv(path.join(packageRoot, "anomaly_register.csv"));

const manifestByHash = new Map(manifest.filter((row) => row.sha256).map((row) => [row.sha256.toLowerCase(), row]));
const reportGroupsByParser = groupBy(reportGroups, "parser_family");
const anomaliesByVendor = groupBy(anomalies, "vendor");
const IMPLEMENTED_PARSER_FAMILIES = new Set([
  "xlsx_1979_dorcel",
  "xlsx_aebn_title",
  "xlsx_aerona_rollup",
  "xlsx_amg_mixed",
  "xlsx_av_royalty_header",
  "xlsx_dusk_playlist",
  "xlsx_erika_summary",
  "xlsx_gamma_running_balance",
  "xlsx_girlfriends_quickbooks",
  "xlsx_hpg_canal",
  "xlsx_hpg_netgem",
  "xlsx_hpg_proximus",
  "xlsx_knpb_credit_note",
  "xlsx_new_sensations_paid",
  "xlsx_pulse_cumulative_balance"
]);

fs.mkdirSync(docsRoot, { recursive: true });

const actualFiles = walk(sampleRoot)
  .filter((file) => path.basename(file) !== ".DS_Store")
  .map((file) => reviewFile(file));

const parserFamilies = Array.from(groupBy(actualFiles, "parser_family").entries())
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([parserFamily, files]) => reviewParserFamily(parserFamily, files));

writeCsv(path.join(docsRoot, "sample_file_parser_review.csv"), actualFiles);
writeCsv(path.join(docsRoot, "parser_family_review.csv"), parserFamilies);
writeMarkdown(path.join(docsRoot, "parser_review.md"), actualFiles, parserFamilies);

console.log(`Reviewed ${actualFiles.length} sample files.`);
console.log(`Wrote docs/parser_review.md`);
console.log(`Wrote docs/sample_file_parser_review.csv`);
console.log(`Wrote docs/parser_family_review.csv`);

function reviewFile(file) {
  const sha256 = hashFile(file);
  const manifestRow = manifestByHash.get(sha256);
  const relativeToProject = normalizePath(path.relative(accountingProject, file));
  const relativeToWorkspace = normalizePath(path.relative(root, file));
  const extension = path.extname(file).toLowerCase().replace(".", "") || "none";
  const parserFamily = manifestRow?.parser_family || "unmatched_source_file";
  const vendorId = manifestRow?.vendor_id || "";
  const vendor = manifestRow?.vendor || vendorConfig.vendors?.[vendorId]?.canonical_customer || "";
  const vendorPolicy = vendorConfig.vendors?.[vendorId] ?? {};
  const workbook = extension === "xlsx" ? inspectWorkbook(file) : null;

  return {
    relative_path: relativeToProject,
    workspace_path: relativeToWorkspace,
    file_name: path.basename(file),
    extension,
    size_bytes: String(fs.statSync(file).size),
    sha256,
    manifest_match: manifestRow ? "yes" : "no",
    vendor_id: vendorId,
    vendor,
    parser_family: parserFamily,
    processing_role: manifestRow?.processing_role || "",
    importance: manifestRow?.importance || "",
    authoritative: manifestRow?.authoritative || "",
    include_in_ingestion: manifestRow?.include_in_ingestion || "",
    status: manifestRow?.status || "",
    automation_state: vendorPolicy.automation_state || "",
    parser_strategy: parserStrategy(parserFamily, vendorPolicy, manifestRow),
    expected_action: expectedAction(parserFamily, vendorPolicy, manifestRow),
    report_group_count: String(reportGroupsByParser.get(parserFamily)?.length ?? 0),
    workbook_sheets: workbook?.sheets || "",
    workbook_header_hints: workbook?.headers || "",
    notes: manifestRow?.notes || ""
  };
}

function reviewParserFamily(parserFamily, files) {
  const first = files[0] ?? {};
  const vendorPolicy = vendorConfig.vendors?.[first.vendor_id] ?? {};
  const groups = reportGroupsByParser.get(parserFamily) ?? [];
  const relatedAnomalies = anomaliesFor(first.vendor);
  return {
    parser_family: parserFamily,
    vendor_id: first.vendor_id || "",
    vendor: first.vendor || "",
    sample_file_count: String(files.length),
    extensions: Array.from(new Set(files.map((file) => file.extension))).join(", "),
    roles: Array.from(new Set(files.map((file) => file.processing_role).filter(Boolean))).join(", "),
    automation_state: vendorPolicy.automation_state || "",
    parser_strategy: parserStrategy(parserFamily, vendorPolicy, first),
    implementation_status: implementationStatus(parserFamily),
    authoritative_amount_rule: vendorPolicy.authoritative_amount_rule || first.notes || "",
    validations: Array.isArray(vendorPolicy.validations) ? vendorPolicy.validations.join("; ") : "",
    posting_policy: vendorPolicy.posting_policy || "",
    report_groups: groups.map((group) => group.report_group_id).join(", "),
    material_issues: [
      ...groups.map((group) => group.material_issue).filter(Boolean),
      ...relatedAnomalies.map((issue) => `${issue.issue_id}: ${issue.finding}`).filter(Boolean)
    ].join(" | "),
    next_parser_work: nextParserWork(parserFamily, vendorPolicy, files)
  };
}

function inspectWorkbook(file) {
  try {
    const workbook = XLSX.readFile(file, { cellDates: false, cellStyles: false });
    const sheets = workbook.SheetNames.map((sheetName) => {
      const ref = workbook.Sheets[sheetName]?.["!ref"] ?? "";
      return `${sheetName}${ref ? ` (${ref})` : ""}`;
    }).join("; ");
    const headers = workbook.SheetNames.slice(0, 6)
      .map((sheetName) => {
        const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
          header: 1,
          raw: true,
          defval: null,
          blankrows: false
        });
        const header = findHeader(rows);
        return header ? `${sheetName}: ${header}` : "";
      })
      .filter(Boolean)
      .join(" | ");
    return { sheets, headers };
  } catch (error) {
    return { sheets: `inspect_failed: ${error.message}`, headers: "" };
  }
}

function findHeader(rows) {
  for (const row of rows.slice(0, 30)) {
    const cells = row.map((cell) => (cell == null ? "" : String(cell).trim())).filter(Boolean);
    const joined = cells.join(" / ");
    if (/Total|Royalties|Reversement|Revenue|Payout|Paid|Studio|Title|Opérateurs|Platforms/i.test(joined)) {
      return joined.slice(0, 240);
    }
  }
  return "";
}

function parserStrategy(parserFamily, policy, row) {
  if (row?.processing_role === "verification_copy" || parserFamily.startsWith("pdf_hpg_verification") || parserFamily === "pdf_verification_copy" || parserFamily === "png_aebn_dashboard") {
    return "verification_only";
  }
  if (parserFamily.startsWith("pdf_") || parserFamily.startsWith("docx_") || parserFamily.includes("image")) {
    return "document_or_image_review_gate";
  }
  if (policy.automation_state?.includes("blocked") || parserFamily.includes("missing")) {
    return "blocked";
  }
  if (parserFamily.startsWith("xlsx_")) {
    if (["xlsx_amg_mixed", "xlsx_gamma_running_balance", "xlsx_pulse_cumulative_balance", "xlsx_embedded_image_omnet"].includes(parserFamily)) {
      return "custom_parser";
    }
    return "config_parser";
  }
  return "review_gate";
}

function expectedAction(parserFamily, policy, row) {
  if (row?.include_in_ingestion === "no") return "do_not_ingest";
  if (row?.processing_role === "verification_copy") return "link_to_primary_report_as_verification";
  if (policy.automation_state?.includes("blocked")) return "block_until_policy_or_source_fixed";
  if (parserFamily === "unmatched_source_file") return "investigate_unmatched_file";
  if (parserFamily.startsWith("pdf_") || parserFamily.startsWith("docx_") || parserFamily.includes("image")) return "extract_candidates_then_human_review";
  return "parse_validate_store_and_export_if_reconciled";
}

function implementationStatus(parserFamily) {
  if (IMPLEMENTED_PARSER_FAMILIES.has(parserFamily)) return "implemented_deterministic";
  if (parserFamily.startsWith("pdf_hpg_verification") || parserFamily === "pdf_verification_copy" || parserFamily === "png_aebn_dashboard") return "verification_only_needed";
  if (parserFamily === "unmatched_source_file") return "needs_classification";
  return "not_implemented_review_gate";
}

function nextParserWork(parserFamily, policy, files) {
  if (implementationStatus(parserFamily) === "implemented_deterministic") return "Keep covered by npm run test:parsers; review-gated outputs usually indicate lookup/policy gaps, not parse errors.";
  if (parserFamily.startsWith("xlsx_hpg_")) return "Create shared HPG channel parser for Canal, Netgem, and Proximus final Revenue column variants; attach paired PDFs as verification.";
  if (parserFamily === "xlsx_pulse_cumulative_balance") return "Custom parser for Summary final balance; suppress negative carryforwards; create postings only for positive balances.";
  if (parserFamily === "xlsx_new_sensations_paid") return "Config parser for Paid detail plus 30 percent fee and expense sheet deduction.";
  if (parserFamily.startsWith("pdf_")) return "Add text/table extraction and force review until source totals reconcile.";
  if (parserFamily === "xlsx_embedded_image_omnet") return "Extract embedded images, OCR/document extraction, then review gate.";
  if (policy.automation_state?.includes("blocked")) return "Do not build parser until missing source or accounting policy is resolved.";
  return `Build ${parserStrategy(parserFamily, policy, files[0])} using source headers and validation rules from vendor_mapping_config.json.`;
}

function anomaliesFor(vendorName) {
  if (!vendorName) return [];
  return Array.from(anomaliesByVendor.entries())
    .filter(([vendor]) => vendorName.toLowerCase().includes(vendor.toLowerCase()) || vendor.toLowerCase().includes(vendorName.toLowerCase()))
    .flatMap(([, values]) => values);
}

function walk(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(fullPath) : [fullPath];
  });
}

function hashFile(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
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

function normalizePath(value) {
  return value.split(path.sep).join("/");
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

function writeMarkdown(file, files, parserFamilies) {
  const primaryFiles = files.filter((row) => row.processing_role === "primary_source");
  const verificationFiles = files.filter((row) => row.processing_role === "verification_copy");
  const unmatched = files.filter((row) => row.manifest_match === "no");
  const implemented = parserFamilies.filter((row) => row.implementation_status === "implemented_initial");
  const blocked = parserFamilies.filter((row) => row.parser_strategy === "blocked");

  const lines = [
    "# Parser Review",
    "",
    "Generated from the actual `Accounting Project/Sample Reports` folder and the normalization package manifest/config.",
    "",
    "## Summary",
    "",
    `- Actual sample files reviewed: ${files.length}`,
    `- Primary source files: ${primaryFiles.length}`,
    `- Verification/supporting files: ${verificationFiles.length}`,
    `- Parser families: ${parserFamilies.length}`,
    `- Implemented initial parser families: ${implemented.map((row) => row.parser_family).join(", ") || "none"}`,
    `- Unmatched files: ${unmatched.length}`,
    `- Blocked parser families: ${blocked.map((row) => row.parser_family).join(", ") || "none"}`,
    "",
    "## Parser Family Plan",
    "",
    "| Parser family | Samples | Strategy | Status | Authoritative amount rule | Next parser work |",
    "| --- | ---: | --- | --- | --- | --- |",
    ...parserFamilies.map((row) =>
      `| ${md(row.parser_family)} | ${row.sample_file_count} | ${md(row.parser_strategy)} | ${md(row.implementation_status)} | ${md(row.authoritative_amount_rule)} | ${md(row.next_parser_work)} |`
    ),
    "",
    "## Primary Source Samples",
    "",
    "| File | Vendor | Parser family | Strategy | Action | Notes |",
    "| --- | --- | --- | --- | --- | --- |",
    ...primaryFiles.map((row) =>
      `| ${md(row.relative_path)} | ${md(row.vendor)} | ${md(row.parser_family)} | ${md(row.parser_strategy)} | ${md(row.expected_action)} | ${md(row.notes)} |`
    ),
    "",
    "## Files To Ignore Or Treat As Verification",
    "",
    "| File | Parser family | Role | Action |",
    "| --- | --- | --- | --- |",
    ...files
      .filter((row) => row.processing_role !== "primary_source")
      .slice(0, 160)
      .map((row) => `| ${md(row.relative_path)} | ${md(row.parser_family)} | ${md(row.processing_role)} | ${md(row.expected_action)} |`),
    "",
    "Full file-level detail is in `docs/sample_file_parser_review.csv`.",
    "Parser family detail is in `docs/parser_family_review.csv`.",
    ""
  ];
  fs.writeFileSync(file, lines.join("\n"), "utf8");
}

function md(value) {
  return String(value ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ").slice(0, 500);
}
