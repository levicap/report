import path from "node:path";
import * as XLSX from "xlsx";
import type { Classification, ReferenceData } from "./types";
import { vendorConfig } from "./config";

const PACKAGE_REFERENCE_FILES = new Set([
  "accounting_normalization_audit.md",
  "accounting_report.schema.json",
  "aerona_raw_rollup_reconciliation.csv",
  "anomaly_register.csv",
  "customer_lookup.csv",
  "field_mapping_matrix.csv",
  "file_manifest.csv",
  "hpg_file_audit.csv",
  "new_sensations_file_audit.csv",
  "pulse_file_audit.csv",
  "readme.md",
  "report_group_audit.csv",
  "sample_normalized_reports.json",
  "schema_validation_results.csv",
  "studio_lookup.csv",
  "target_field_gap_analysis.csv",
  "vendor_mapping_config.json",
  "vertical_lookup.csv"
]);

const COMMON_VENDOR_TOKENS = new Set([
  "all",
  "and",
  "adult",
  "broadcast",
  "downloaded",
  "emailed",
  "entered",
  "films",
  "group",
  "holding",
  "holdings",
  "inc",
  "licensing",
  "llc",
  "load",
  "media",
  "production",
  "productions",
  "report",
  "reports",
  "solutions",
  "time",
  "vod"
]);

type DeterministicRule = {
  vendor_id: string | null;
  parser_family: string;
  source_role?: string;
  authoritative?: boolean;
  confidence?: string;
  period_hint?: string | null;
  reason: string;
};

export function classifyFile(originalName: string, sha256: string, refs: ReferenceData, bytes?: Buffer): Classification {
  if (PACKAGE_REFERENCE_FILES.has(path.basename(originalName).toLowerCase())) {
    return {
      vendor_id: null,
      vendor_name: null,
      parser_family: "package_reference_file",
      profile_key: "package_reference_ignore_v1",
      period_hint: null,
      currency: "UNKNOWN",
      source_role: "supporting",
      authoritative: false,
      confidence: "1.0",
      status: "reference_file",
      reason: "This file is part of the audit/config package, not a platform source report.",
      manifest_row: null
    };
  }

  const manifestRows = refs.manifestRows.filter((row) => row.sha256?.toLowerCase() === sha256.toLowerCase());
  const manifestRow = pickManifestRowForFile(originalName, manifestRows) ?? refs.manifestByHash.get(sha256.toLowerCase());
  if (manifestRow) {
    const vendorId = manifestRow.vendor_id || null;
    const vendor = vendorConfig(refs, vendorId);
    return {
      vendor_id: vendorId,
      vendor_name: manifestRow.vendor || vendor.canonical_customer || null,
      parser_family: manifestRow.parser_family || vendor.parser_family || "unknown",
      profile_key: `${vendorId ?? "unknown"}_v1`,
      period_hint: manifestRow.period_hint || null,
      currency: vendor.currency || "UNKNOWN",
      source_role: roleFromManifest(manifestRow),
      authoritative: manifestRow.authoritative === "yes",
      confidence: "1.0",
      status: "matched_manifest",
      reason: "SHA-256 matched file_manifest.csv",
      manifest_row: manifestRow
    };
  }

  const deterministicRule = deterministicClassification(originalName);
  if (deterministicRule) {
    const vendor = vendorConfig(refs, deterministicRule.vendor_id);
    return {
      vendor_id: deterministicRule.vendor_id,
      vendor_name: vendor.canonical_customer || null,
      parser_family: deterministicRule.parser_family,
      profile_key: `${deterministicRule.vendor_id ?? "unknown"}_v1`,
      period_hint: deterministicRule.period_hint ?? extractPeriodHint(originalName),
      currency: vendor.currency || "UNKNOWN",
      source_role: deterministicRule.source_role ?? "primary",
      authoritative: deterministicRule.authoritative ?? true,
      confidence: deterministicRule.confidence ?? "0.95",
      status: "deterministic_name_match",
      reason: deterministicRule.reason,
      manifest_row: null
    };
  }

  const contentRule = contentClassification(originalName, bytes);
  if (contentRule) {
    const vendor = vendorConfig(refs, contentRule.vendor_id);
    return {
      vendor_id: contentRule.vendor_id,
      vendor_name: vendor.canonical_customer || null,
      parser_family: contentRule.parser_family,
      profile_key: `${contentRule.vendor_id ?? "unknown"}_v1`,
      period_hint: contentRule.period_hint ?? extractPeriodHint(originalName),
      currency: vendor.currency || "UNKNOWN",
      source_role: contentRule.source_role ?? "primary",
      authoritative: contentRule.authoritative ?? true,
      confidence: contentRule.confidence ?? "0.90",
      status: "deterministic_content_match",
      reason: contentRule.reason,
      manifest_row: null
    };
  }

  const nameTokens = new Set(normalizeWords(originalName));
  for (const [vendorId, vendor] of Object.entries<Record<string, any>>(refs.vendorConfig.vendors ?? {})) {
    const tokens = String(vendor.canonical_customer ?? "")
      .toLowerCase()
      .replace(/[()/]/g, " ")
      .split(/\s+/)
      .filter((token) => token.length >= 4)
      .filter((token) => !COMMON_VENDOR_TOKENS.has(token));

    if (tokens.some((token) => nameTokens.has(token))) {
      return {
        vendor_id: vendorId,
        vendor_name: vendor.canonical_customer,
        parser_family: vendor.parser_family || "unknown",
        profile_key: `${vendorId}_v1`,
        period_hint: null,
        currency: vendor.currency || "UNKNOWN",
        source_role: "primary",
        authoritative: true,
        confidence: "0.70",
        status: "filename_guess",
        reason: "Filename matched vendor name token. Review required unless parser validation passes.",
        manifest_row: null
      };
    }
  }

  const extension = path.extname(originalName).replace(".", "") || "file";
  return {
    vendor_id: null,
    vendor_name: null,
    parser_family: `unknown_${extension}`,
    profile_key: "unknown_review_v1",
    period_hint: null,
    currency: "UNKNOWN",
    source_role: "primary",
    authoritative: true,
    confidence: "0.0",
    status: "unknown",
    reason: "No manifest hash or filename rule matched this file.",
    manifest_row: null
  };
}

function pickManifestRowForFile(originalName: string, rows: Array<Record<string, string>>): Record<string, string> | null {
  if (rows.length === 0) {
    return null;
  }
  if (rows.length === 1) {
    return rows[0];
  }

  const normalizedOriginal = normalizeManifestPath(originalName);
  const pathMatched = rows.find((row) => {
    const relativePath = normalizeManifestPath(row.relative_path || "");
    return relativePath && (normalizedOriginal.endsWith(relativePath) || normalizedOriginal.endsWith(`accounting project/${relativePath}`));
  });
  if (pathMatched) {
    return pathMatched;
  }

  const authoritative = rows.find((row) => row.authoritative === "yes");
  return authoritative ?? rows[0];
}

function normalizeManifestPath(value: string): string {
  return value
    .replace(/\\/g, "/")
    .replace(/^\.\//, "")
    .replace(/\/+/g, "/")
    .toLowerCase();
}

function deterministicClassification(originalName: string): DeterministicRule | null {
  const normalized = normalizeText(originalName);
  const base = normalizeText(path.basename(originalName));
  const extension = path.extname(originalName).toLowerCase();

  if (hasAny(normalized, ["aerona llc", "ade vod downloaded"]) || base.includes("aecash item report")) {
    if (base.includes("aecash item report")) {
      return {
        vendor_id: "aerona",
        parser_family: "xlsx_aerona_rollup",
        reason: "AERONA rollup report matched by folder or aecash_item_report filename."
      };
    }
    if ([".pdf", ".png", ".jpg", ".jpeg"].includes(extension)) {
      return {
        vendor_id: "aerona",
        parser_family: extension === ".pdf" ? "pdf_verification_copy" : "image_verification_copy",
        source_role: "verification",
        authoritative: false,
        reason: "AERONA non-tabular support file matched by folder."
      };
    }
    if (
      hasAny(base, ["baeb", "carnal network", "jay rock", "jayrock", "true x", "truex", "aecash on demand credit"]) ||
      extension === ".csv"
    ) {
      return {
        vendor_id: "aerona",
        parser_family: "xlsx_aerona_raw_platform",
        source_role: "supporting",
        authoritative: false,
        reason: "AERONA raw platform detail matched by folder and filename."
      };
    }
  }

  if (
    hasAny(normalized, ["wmm holdings llc", "aebn webmaster", "aebn 2020"]) ||
    base.includes("studio statistics payout by title")
  ) {
    if ([".png", ".jpg", ".jpeg"].includes(extension) || base.includes("screen shot") || base.includes("screenshot")) {
      return {
        vendor_id: "aebn",
        parser_family: "png_aebn_dashboard",
        source_role: "verification",
        authoritative: false,
        reason: "AEBN portal screenshot matched by folder or filename."
      };
    }
    if (extension === ".pdf") {
      return {
        vendor_id: "aebn",
        parser_family: "pdf_verification_copy",
        source_role: "verification",
        authoritative: false,
        reason: "AEBN non-tabular support PDF matched by folder."
      };
    }
    return {
      vendor_id: "aebn",
      parser_family: "xlsx_aebn_title",
      reason: "AEBN title payout report matched by folder or Studio Statistics filename."
    };
  }

  if (hasAny(normalized, ["1979 media", "dorcel"]) || base.includes("releve vod")) {
    return {
      vendor_id: "1979_media",
      parser_family: "xlsx_1979_dorcel",
      reason: "1979/Dorcel report matched by folder or RELEVE VOD filename."
    };
  }

  if (
    hasAny(normalized, ["all media group", "amg licensing"]) ||
    /^nmg.*(?:payment|payout).*report/i.test(path.basename(originalName)) ||
    /^new media group.*payment report/i.test(path.basename(originalName))
  ) {
    return {
      vendor_id: "amg",
      parser_family: "xlsx_amg_mixed",
      reason: "AMG payment report matched by folder or NMG payment report filename."
    };
  }

  if (hasAny(normalized, ["bell canada"]) || /ppv[_\s-]*vod studio payment report/i.test(path.basename(originalName))) {
    if (base.includes("bell canada titles and studio")) {
      return {
        vendor_id: "bell_canada",
        parser_family: "xlsx_bell_canada_title_map",
        source_role: "allocation_model",
        authoritative: false,
        reason: "Bell Canada title-to-studio mapping workbook matched by filename."
      };
    }
    return {
      vendor_id: "bell_canada",
      parser_family: extension === ".pdf" ? "pdf_verification_copy" : "xlsx_bell_canada_payment",
      source_role: extension === ".pdf" ? "verification" : "primary",
      authoritative: extension !== ".pdf",
      reason: "Bell Canada PPV/VOD Studio Payment report matched by folder or filename."
    };
  }

  if (
    hasAny(normalized, ["dusk t v", "2grapesmedia", "2grapesmedia b v"]) ||
    hasAny(base, ["playlist nat int", "playlist nat and int", "nat int", "nat and int"])
  ) {
    return {
      vendor_id: "dusk",
      parser_family: extension === ".pdf" ? "pdf_verification_copy" : "xlsx_dusk_playlist",
      source_role: extension === ".pdf" ? "verification" : "primary",
      authoritative: extension !== ".pdf",
      reason: "Dusk playlist matched by folder or NAT/INT filename."
    };
  }

  if (hasAny(normalized, ["erigo load"]) || base === "erigo pdf" || base.includes("nmg mail payment") || base.includes("erigo payment")) {
    if (isErigoSupportDocument(base)) {
      return {
        vendor_id: "erigo",
        parser_family: "pdf_verification_copy",
        source_role: "supporting",
        authoritative: false,
        reason: "Erigo supporting expense/verification document matched by folder or filename."
      };
    }
    return {
      vendor_id: "erigo",
      parser_family: "pdf_payment_narrative",
      reason: "Erigo payment report matched by folder or Erigo filename."
    };
  }

  if (hasAny(normalized, ["erika lust", "lust productions"])) {
    return {
      vendor_id: "erika_lust",
      parser_family: extension === ".xlsx" ? "xlsx_erika_summary" : "pdf_verification_copy",
      source_role: extension === ".xlsx" ? "primary" : "verification",
      authoritative: extension === ".xlsx",
      reason: "Erika Lust report matched by folder."
    };
  }

  if (hasAny(normalized, ["velvet media"]) || /rfi new media group/i.test(path.basename(originalName))) {
    return {
      vendor_id: "velvet",
      parser_family: extension === ".pdf" ? "pdf_verification_copy" : "xlsx_velvet_rfi_specs",
      source_role: extension === ".pdf" ? "verification" : "primary",
      authoritative: extension !== ".pdf",
      reason: "Velvet RFI source matched by folder or RFI filename; parser is not implemented yet."
    };
  }

  if (hasAny(normalized, ["gamma broadcast group"]) || /\beentinc\b|\beent inc\b/i.test(path.basename(originalName))) {
    return {
      vendor_id: "gamma_licensing",
      parser_family: "xlsx_gamma_running_balance",
      reason: "Gamma licensing report matched by folder or EENT filename."
    };
  }

  if (hasAny(normalized, ["adulttimecontentroyalties", "adult time"])) {
    return {
      vendor_id: "gamma_adult_time",
      parser_family: "pdf_adulttime_scene",
      reason: "AdultTime royalty PDF matched by filename."
    };
  }

  if (hasAny(normalized, ["girlfriends films"])) {
    return {
      vendor_id: "girlfriends_films",
      parser_family: "xlsx_girlfriends_quickbooks",
      reason: "Girlfriends Films workbook matched by folder."
    };
  }

  if (hasAny(normalized, ["hpg production", "nmg canalplay", "nmg netgem", "nmg proximus"])) {
    const parserFamily = normalized.includes("netgem")
      ? "xlsx_hpg_netgem"
      : normalized.includes("proximus")
        ? "xlsx_hpg_proximus"
        : "xlsx_hpg_canal";
    return {
      vendor_id: "hpg",
      parser_family: extension === ".pdf" ? "pdf_hpg_verification" : parserFamily,
      source_role: extension === ".pdf" ? "verification" : "primary",
      authoritative: extension !== ".pdf",
      reason: "HPG channel report matched by folder or channel filename."
    };
  }

  if (hasAny(normalized, ["new sensations inc"]) || /\b(?:lhfs|lfhs|lwi|mylf|pure|visn)\b.*4-26/i.test(path.basename(originalName))) {
    return {
      vendor_id: "new_sensations",
      parser_family: "xlsx_new_sensations_paid",
      reason: "New Sensations workbook matched by folder or studio workbook filename."
    };
  }

  if (hasAny(normalized, ["pulse distribution"])) {
    return {
      vendor_id: "pulse",
      parser_family: "xlsx_pulse_cumulative_balance",
      reason: "Pulse workbook matched by folder."
    };
  }

  return null;
}

function contentClassification(originalName: string, bytes?: Buffer): DeterministicRule | null {
  const extension = path.extname(originalName).toLowerCase();
  if (!bytes || ![".xlsx", ".xls", ".csv"].includes(extension)) {
    return null;
  }

  const workbookText = extractWorkbookText(bytes);
  if (!workbookText) {
    return null;
  }

  if (hasAny(workbookText, ["erika lust films s l", "lust productions s l", "erika lust"])) {
    return {
      vendor_id: "erika_lust",
      parser_family: "xlsx_erika_summary",
      period_hint: extractPeriodHint([originalName, workbookText].join(" ")),
      reason: "Erika Lust workbook matched by report contents."
    };
  }

  if (
    hasAny(workbookText, ["producer name", "channel name", "sum de total royalties"]) &&
    hasAny(workbookText, ["lustcinema", "onelust", "sex art studio", "pure passion", "nubile films", "lustery"])
  ) {
    return {
      vendor_id: "erika_lust",
      parser_family: "xlsx_erika_summary",
      period_hint: extractPeriodHint([originalName, workbookText].join(" ")),
      reason: "Erika Lust workbook matched by producer/channel royalty pivot contents."
    };
  }

  return null;
}

function extractWorkbookText(bytes: Buffer): string | null {
  try {
    const workbook = XLSX.read(bytes, { type: "buffer", cellDates: false });
    const values: string[] = [];
    for (const sheetName of workbook.SheetNames.slice(0, 3)) {
      const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], {
        header: 1,
        raw: false,
        defval: "",
        blankrows: false
      });
      for (const row of rows.slice(0, 160)) {
        for (const value of row) {
          const text = String(value ?? "").trim();
          if (text) {
            values.push(text);
          }
        }
      }
    }
    return normalizeText(values.join(" "));
  } catch {
    return null;
  }
}

function extractPeriodHint(originalName: string): string | null {
  const normalized = originalName.replace(/[_-]+/g, " ");
  const explicitQuarter = normalized.match(/\bQ([1-4])\s*(20\d{2})\b/i);
  if (explicitQuarter) {
    return `${explicitQuarter[2]} Q${explicitQuarter[1]}`;
  }
  const yearQuarter = normalized.match(/\b(20\d{2})\s*Q([1-4])\b/i);
  if (yearQuarter) {
    return `${yearQuarter[1]} Q${yearQuarter[2]}`;
  }
  const month = normalized.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec|Januari|Februari|Maart|Mrt|Mei|Juni|Juli|Oktober|Okt)\s+(20\d{2})\b/i);
  if (month) {
    return `${month[1]} ${month[2]}`;
  }
  const isoMonth = normalized.match(/\b(20\d{2})[\\/_ -](0?[1-9]|1[0-2])\b/);
  if (isoMonth) {
    return `${isoMonth[1]}-${isoMonth[2].padStart(2, "0")}`;
  }
  return null;
}

function hasAny(text: string, needles: string[]): boolean {
  return needles.some((needle) => text.includes(needle));
}

function isErigoSupportDocument(baseName: string): boolean {
  return /\b(?:bbfc|pressing|invoice|invocie|inv|vt\s*titles?|vtitle|vt\d+|e\d+|ih\d+)\b/i.test(baseName)
    || baseName.includes("metart payment sheet july2020");
}

function normalizeText(value: string): string {
  return normalizeWords(value).join(" ");
}

function normalizeWords(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[\\/]+/g, " ")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function roleFromManifest(row: Record<string, string>): string {
  if (row.processing_role === "primary_source") {
    return "primary";
  }
  if (row.processing_role === "verification_copy") {
    return "verification";
  }
  if (row.processing_role === "supporting_transaction_detail") {
    return "supporting";
  }
  if (row.processing_role === "allocation_model") {
    return "allocation_model";
  }
  if (row.duplicate_group && row.authoritative !== "yes") {
    return "duplicate";
  }
  return "primary";
}
