import fs from "node:fs";
import path from "node:path";
import xlsx from "xlsx";

const XLSX = xlsx.default ?? xlsx;

const root = process.cwd();
const airtablePath = path.join(root, "Accounting Project", "Copy of NMG Airtable Data Entry - This is where you will find processed through Airtable  data.xlsx");
const groupAuditPath = path.join(root, "accounting_normalization_package", "report_group_audit.csv");
const familyReviewPath = path.join(root, "docs", "parser_family_review.csv");
const outputCsv = path.join(root, "docs", "nmg_airtable_comparison.csv");
const outputMd = path.join(root, "docs", "nmg_airtable_comparison.md");

const groupRows = readCsv(groupAuditPath);
const familyRows = readCsv(familyReviewPath);
const familyById = new Map(familyRows.map((row) => [row.parser_family, row]));
const wb = XLSX.read(fs.readFileSync(airtablePath), { type: "buffer", cellDates: false });
const dataRows = XLSX.utils.sheet_to_json(wb.Sheets["Data Entry"], { defval: null, raw: true });

const normalizedDataRows = dataRows.map((row) => ({
  customer: text(row.Customer),
  studio: text(row.Studio),
  amount: numberValue(row.Amount),
  memo: text(row.Memo),
  invoiceDate: excelDate(row["Invoice Date"]),
  dueDate: excelDate(row["Due Date"]),
  vertical: text(row.Vertical)
}));

const comparison = groupRows
  .filter((row) => row.report_group_id && !row.report_group_id.startsWith("control") && row.report_group_id !== "historical_airtable" && row.report_group_id !== "column_glossary")
  .map((row) => {
    const family = familyById.get(row.parser_family) ?? {};
    const vendor = row.vendor;
    const parserFamily = normalizeParserFamily(row.parser_family);
    const period = row.period;
    const expected = numberValue(row.posting_total) ?? numberValue(row.declared_total);
    const candidates = findCandidates(normalizedDataRows, vendor, period);
    const candidateSum = candidates.reduce((sum, item) => sum + (item.amount ?? 0), 0);
    const exactAmount = expected === null ? [] : candidates.filter((item) => item.amount !== null && Math.abs(item.amount - expected) <= 0.02);
    const closest = expected === null ? null : candidates.reduce((best, item) => {
      if (item.amount === null) return best;
      const diff = Math.abs(item.amount - expected);
      if (!best || diff < best.diff) return { item, diff };
      return best;
    }, null);
    const groupedDiff = expected === null ? null : candidateSum - expected;
    const targetMatchStatus =
      expected !== null && candidates.length > 0 && Math.abs(groupedDiff) <= 0.02
        ? "period_sum_match"
        : exactAmount.length > 0
          ? "single_row_amount_match"
          : candidates.length > 0
            ? "customer_period_candidates"
            : "no_customer_period_match";
    return {
      report_group_id: row.report_group_id,
      vendor,
      period,
      parser_family: parserFamily,
      source_format: row.source_format,
      automation_state: row.automation_state,
      implementation_status: family.implementation_status || "",
      should_extract: row.authoritative_amount_rule,
      posting_policy: row.recommended_action || family.posting_policy || "",
      expected_posting_total: row.posting_total || row.declared_total || "",
      target_match_status: targetMatchStatus,
      target_candidate_count: String(candidates.length),
      target_candidate_sum: candidates.length > 0 ? candidateSum.toFixed(6) : "",
      target_grouped_diff: groupedDiff === null || candidates.length === 0 ? "" : groupedDiff.toFixed(6),
      closest_target_amount: closest ? String(closest.item.amount) : "",
      closest_target_memo: closest ? closest.item.memo : "",
      closest_target_studio: closest ? closest.item.studio : "",
      closest_amount_diff: closest ? closest.diff.toFixed(6) : "",
      notes: row.material_issue || family.material_issues || ""
    };
  });

fs.mkdirSync(path.dirname(outputCsv), { recursive: true });
fs.writeFileSync(outputCsv, toCsv(comparison), "utf8");
fs.writeFileSync(outputMd, renderMarkdown(comparison), "utf8");

console.log(`Wrote ${outputCsv}`);
console.log(`Wrote ${outputMd}`);

function findCandidates(rows, vendor, period) {
  const customerNeedles = customerAliases(vendor);
  const periodNeedles = periodTokens(period);
  return rows.filter((row) => {
    const customer = row.customer.toLowerCase();
    const memo = row.memo.toLowerCase();
    const customerMatch = customerNeedles.some((needle) => customer.includes(needle) || needle.includes(customer));
    if (!customerMatch) return false;
    if (periodNeedles.length === 0) return true;
    return periodNeedles.some((needle) => memo.includes(needle));
  });
}

function customerAliases(vendor) {
  const lower = vendor.toLowerCase();
  const aliases = new Set([lower]);
  if (lower.includes("aerona")) aliases.add("aerona llc");
  if (lower.includes("1979")) aliases.add("1979 media");
  if (lower.includes("all media")) aliases.add("all media group");
  if (lower.includes("av entertainment")) aliases.add("av entertainment");
  if (lower.includes("dream")) aliases.add("dream logistics");
  if (lower.includes("dusk")) aliases.add("dusk");
  if (lower.includes("erigo")) aliases.add("erigo");
  if (lower.includes("erika")) aliases.add("erika lust");
  if (lower.includes("gamma")) aliases.add("gamma broadcast");
  if (lower.includes("girlfriends")) aliases.add("girlfriends films");
  if (lower.includes("hpg")) aliases.add("hpg");
  if (lower.includes("knpb")) aliases.add("knpb");
  if (lower.includes("level5")) aliases.add("level5");
  if (lower.includes("new sensations")) aliases.add("new sensations");
  if (lower.includes("omnet")) aliases.add("omnet");
  if (lower.includes("pulse")) aliases.add("pulse distribution");
  if (lower.includes("sonifi")) aliases.add("sonifi");
  return Array.from(aliases).map((value) => value.replace(/\s+/g, " ").trim()).filter(Boolean);
}

function periodTokens(period) {
  const lower = String(period || "").toLowerCase();
  const tokens = [];
  const monthMap = {
    "01": "january",
    "02": "february",
    "03": "march",
    "04": "april",
    "05": "may",
    "06": "june",
    "07": "july",
    "08": "august",
    "09": "september",
    "10": "october",
    "11": "november",
    "12": "december"
  };
  for (const [number, name] of Object.entries(monthMap)) {
    if (lower.includes(`2026-${number}`) || lower.includes(`${number}-2026`) || lower.includes(name)) {
      tokens.push(`${name} 2026`);
      tokens.push(name);
    }
  }
  const quarter = lower.match(/2026\s*q([1-4])|q([1-4])\s*2026/);
  if (quarter) {
    tokens.push(`q${quarter[1] || quarter[2]} 2026`);
    tokens.push(`2026 q${quarter[1] || quarter[2]}`);
  }
  if (lower.includes("march, april, and may")) {
    tokens.push("march");
    tokens.push("april");
    tokens.push("may");
  }
  return Array.from(new Set(tokens));
}

function normalizeParserFamily(value) {
  return value === "xlsx_hpg_channel" ? "xlsx_hpg_canal / xlsx_hpg_netgem / xlsx_hpg_proximus" : value;
}

function text(value) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function numberValue(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(String(value).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function excelDate(value) {
  if (typeof value !== "number") return text(value);
  const parsed = XLSX.SSF.parse_date_code(value);
  if (!parsed) return "";
  return `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
}

function readCsv(filePath) {
  const text = fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
  const rows = parseCsv(text);
  const [headers, ...body] = rows;
  return body.filter((row) => row.some((value) => value.trim() !== "")).map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""])));
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

function toCsv(rows) {
  const headers = Object.keys(rows[0] ?? {});
  return [headers.join(","), ...rows.map((row) => headers.map((header) => csvEscape(row[header] ?? "")).join(","))].join("\n");
}

function csvEscape(value) {
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function renderMarkdown(rows) {
  const counts = rows.reduce((acc, row) => {
    acc[row.target_match_status] = (acc[row.target_match_status] ?? 0) + 1;
    return acc;
  }, {});
  const topRows = rows.map((row) => `| ${row.report_group_id} | ${row.vendor} | ${row.period} | ${row.parser_family} | ${row.expected_posting_total} | ${row.target_match_status} | ${row.target_candidate_sum} | ${row.target_grouped_diff} |`).join("\n");
  return `# NMG Airtable Comparison\n\nGenerated from report_group_audit.csv, parser_family_review.csv, and the NMG Airtable Data Entry workbook.\n\n## Summary\n\n- Period sum matches: ${counts.period_sum_match ?? 0}\n- Single row amount matches: ${counts.single_row_amount_match ?? 0}\n- Customer/period candidates but no amount match: ${counts.customer_period_candidates ?? 0}\n- No customer/period match found: ${counts.no_customer_period_match ?? 0}\n\n## Report Groups\n\n| Report Group | Vendor | Period | Parser Family | Expected Posting Total | Target Match | Target Candidate Sum | Grouped Difference |\n|---|---|---|---|---:|---|---:|---:|\n${topRows}\n`;
}
