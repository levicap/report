import crypto from "node:crypto";
import { classifyFile } from "./classifier";
import { loadReferenceData } from "./config";
import { parseByFamily } from "./parsers";
import { validateNormalizedReport } from "./schema";
import type { ParserResult } from "./types";

export function parseReportFromBuffer(bytes: Buffer, originalName: string): ParserResult {
  const refs = loadReferenceData();
  const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
  const classification = classifyFile(originalName, sha256, refs);
  let result = parseByFamily(bytes, originalName, sha256, classification, refs);
  result = ensurePostingRecords(result);

  const schemaResults = validateNormalizedReport(result.normalized_report);
  result.validation_results.push(...schemaResults);

  if (schemaResults.some((item) => item.status === "failed")) {
    result = {
      ...result,
      report: {
        ...result.report,
        status: "review",
        review_required: true
      },
      review_items: [
        ...result.review_items,
        {
          record_key: null,
          priority: 2,
          reason: "Normalized JSON failed schema validation.",
          original_value: { schema_results: schemaResults },
          proposed_value: result.normalized_report
        }
      ]
    };
  }

  return result;
}

function ensurePostingRecords(result: ParserResult): ParserResult {
  const postings = Array.isArray(result.normalized_report.accounting_postings)
    ? (result.normalized_report.accounting_postings as Array<Record<string, any>>)
    : [];

  if (postings.length === 0) {
    return result;
  }

  const existingRecordKeys = new Set(result.records.map((record) => String(record.record_key)));
  const postingRecords = postings
    .filter((posting) => posting.posting_id && !existingRecordKeys.has(String(posting.posting_id)))
    .map((posting) => ({
      record_key: posting.posting_id,
      record_type: "posting",
      status: normalizePostingStatus(posting.status),
      normalized_json: posting,
      amount: posting.amount?.amount ?? null,
      currency: posting.amount?.currency ?? result.normalized_report.currency ?? null,
      source_line_ids: Array.isArray(posting.source_line_ids) ? posting.source_line_ids : []
    }));

  if (postingRecords.length === 0) {
    return result;
  }

  return {
    ...result,
    records: [...result.records, ...postingRecords]
  };
}

function normalizePostingStatus(status: unknown): string {
  const value = typeof status === "string" ? status : "review";
  return ["ready", "review", "blocked", "suppressed", "exported"].includes(value) ? value : "review";
}
