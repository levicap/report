import fs from "node:fs";
import path from "node:path";
import type { ReferenceData } from "./types";

export function loadReferenceData(packageDir = path.join(process.cwd(), "accounting_normalization_package")): ReferenceData {
  const vendorConfig = JSON.parse(fs.readFileSync(path.join(packageDir, "vendor_mapping_config.json"), "utf8"));
  const manifestRows = readCsv(path.join(packageDir, "file_manifest.csv"));
  const studioRows = readCsv(path.join(packageDir, "studio_lookup.csv"));
  const customerRows = readCsv(path.join(packageDir, "customer_lookup.csv"));

  return {
    vendorConfig,
    manifestRows,
    manifestByHash: new Map(manifestRows.filter((row) => row.sha256).map((row) => [row.sha256.toLowerCase(), row])),
    studioByName: new Map(studioRows.filter((row) => row.canonical_studio).map((row) => [row.canonical_studio.trim().toLowerCase(), row])),
    customerByName: new Map(customerRows.filter((row) => row.source_customer_name).map((row) => [row.source_customer_name.trim().toLowerCase(), row]))
  };
}

export function loadAccountingSchema(packageDir = path.join(process.cwd(), "accounting_normalization_package")) {
  return JSON.parse(fs.readFileSync(path.join(packageDir, "accounting_report.schema.json"), "utf8"));
}

export function vendorConfig(refs: ReferenceData, vendorId: string | null | undefined): Record<string, any> {
  if (!vendorId) {
    return {};
  }
  return refs.vendorConfig.vendors?.[vendorId] ?? {};
}

export function mapStudio(refs: ReferenceData, sourceName: string | null | undefined) {
  if (!sourceName) {
    return {
      source_name: sourceName ?? null,
      canonical_name: null,
      parent_entity: null,
      billing_entity: null,
      lookup_status: "unmatched"
    };
  }

  const row = studioLookupKeys(sourceName).map((key) => refs.studioByName.get(key)).find(Boolean);
  if (!row) {
    return {
      source_name: sourceName,
      canonical_name: null,
      parent_entity: null,
      billing_entity: null,
      lookup_status: "unmatched"
    };
  }

  return {
    source_name: sourceName,
    canonical_name: row.canonical_studio || null,
    parent_entity: row.parent_studio || null,
    billing_entity: row.parent_studio || null,
    lookup_status: "matched"
  };
}

function studioLookupKeys(sourceName: string): string[] {
  const trimmed = sourceName.trim();
  return Array.from(
    new Set([
      trimmed.toLowerCase(),
      trimmed.replace(/\bInc$/i, "Inc.").toLowerCase(),
      trimmed.replace(/\.$/, "").toLowerCase()
    ])
  );
}

export function canonicalCustomer(refs: ReferenceData, sourceName: string | null | undefined): string | null {
  if (!sourceName) {
    return null;
  }
  const lookupKeys = [
    sourceName.trim().toLowerCase(),
    sourceName.trim().replace(/\s*\/\s*/g, "/").toLowerCase()
  ];
  const row = lookupKeys.map((key) => refs.customerByName.get(key)).find(Boolean);
  return row?.canonical_billing_customer || sourceName;
}

function readCsv(filePath: string): Array<Record<string, string>> {
  if (!fs.existsSync(filePath)) {
    return [];
  }
  const rows = parseCsv(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
  const [headers, ...body] = rows;
  if (!headers) {
    return [];
  }
  return body
    .filter((row) => row.some((value) => value.trim() !== ""))
    .map((row) =>
      Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""]))
    );
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
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

    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
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
