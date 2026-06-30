import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const root = process.cwd();
loadEnv(path.join(root, ".env"));

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_KEY;

if (!url || !key || key === "replace_with_supabase_service_role_key") {
  throw new Error("Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY or SUPABASE_SECRET_KEY.");
}

const supabase = createClient(url, key, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

const tables = [
  "exports",
  "record_comments",
  "review_items",
  "validation_results",
  "field_provenance",
  "report_records",
  "review_items",
  "validation_results",
  "field_provenance",
  "reconciliation_snapshots",
  "processing_runs",
  "report_source_files",
  "reports",
  "source_files",
  "source_file_blobs"
];

const DELETE_BATCH_SIZE = 500;

for (const table of tables) {
  const deleted = await clearTable(table);
  console.log(`${table}: deleted ${deleted}`);
}

for (const table of ["record_comments", "review_items", "validation_results", "field_provenance", "report_records", "reconciliation_snapshots", "processing_runs"]) {
  const deleted = await clearTable(table);
  if (deleted > 0) {
    console.log(`${table}: deleted ${deleted} on final pass`);
  }
}

console.log("Supabase app data tables are empty. Reference tables were left intact.");

async function clearTable(table) {
  const keyColumn = table === "report_source_files" ? "report_id" : "id";
  let deletedTotal = 0;

  while (true) {
    const selected = await supabase
      .from(table)
      .select(keyColumn)
      .not(keyColumn, "is", null)
      .limit(DELETE_BATCH_SIZE);

    if (selected.error) {
      if (selected.error.code === "42P01" || /does not exist|schema cache/i.test(selected.error.message ?? "")) {
        return deletedTotal;
      }
      throw new Error(`Failed to select ${table}: ${selected.error.message}`);
    }

    const keys = Array.from(new Set((selected.data ?? []).map((row) => row[keyColumn]).filter(Boolean)));
    if (keys.length === 0) {
      return deletedTotal;
    }

    const deleted = await supabase.from(table).delete({ count: "exact" }).in(keyColumn, keys);
    if (deleted.error) {
      if (deleted.error.code === "42P01" || /does not exist|schema cache/i.test(deleted.error.message ?? "")) {
        return deletedTotal;
      }
      throw new Error(`Failed to clear ${table}: ${deleted.error.message}`);
    }
    deletedTotal += deleted.count ?? keys.length;
  }
}

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const separator = trimmed.indexOf("=");
    if (separator === -1) {
      continue;
    }
    const name = trimmed.slice(0, separator).trim();
    const rawValue = trimmed.slice(separator + 1).trim();
    if (!name || process.env[name] !== undefined) {
      continue;
    }
    process.env[name] = rawValue.replace(/^["']|["']$/g, "");
  }
}
