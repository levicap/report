export type Classification = {
  vendor_id: string | null;
  vendor_name: string | null;
  parser_family: string;
  profile_key: string;
  period_hint: string | null;
  currency: string;
  source_role: string;
  authoritative: boolean;
  confidence: string;
  status: string;
  reason: string;
  manifest_row: Record<string, string> | null;
};

export type ParserResult = {
  source_hash: string;
  original_name: string;
  classification: Classification;
  report: Record<string, unknown>;
  normalized_report: Record<string, unknown>;
  records: Array<Record<string, unknown>>;
  field_provenance: Array<Record<string, unknown>>;
  validation_results: Array<Record<string, unknown>>;
  review_items: Array<Record<string, unknown>>;
  reconciliation_snapshots: Array<Record<string, unknown>>;
};

export type ReferenceData = {
  vendorConfig: Record<string, any>;
  manifestRows: Array<Record<string, string>>;
  manifestByHash: Map<string, Record<string, string>>;
  studioByName: Map<string, Record<string, string>>;
  customerByName: Map<string, Record<string, string>>;
};

