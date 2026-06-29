import path from "node:path";
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

export function classifyFile(originalName: string, sha256: string, refs: ReferenceData): Classification {
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

  const manifestRow = refs.manifestByHash.get(sha256.toLowerCase());
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

  const lowerName = originalName.toLowerCase();
  for (const [vendorId, vendor] of Object.entries<Record<string, any>>(refs.vendorConfig.vendors ?? {})) {
    const tokens = String(vendor.canonical_customer ?? "")
      .toLowerCase()
      .replace(/[()/]/g, " ")
      .split(/\s+/)
      .filter((token) => token.length >= 4);

    if (tokens.some((token) => lowerName.includes(token))) {
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

function roleFromManifest(row: Record<string, string>): string {
  if (row.processing_role === "verification_copy") {
    return "verification";
  }
  if (row.processing_role === "supporting_transaction_detail") {
    return "supporting";
  }
  if (row.processing_role === "allocation_model") {
    return "allocation_model";
  }
  if (row.duplicate_group) {
    return "duplicate";
  }
  return "primary";
}
