import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { loadAccountingSchema } from "./config";

export function validateNormalizedReport(report: Record<string, unknown>): Array<Record<string, unknown>> {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  const validate = ajv.compile(loadAccountingSchema());
  const valid = validate(report);

  if (valid) {
    return [
      {
        check_name: "json_schema",
        status: "passed",
        severity: "info",
        message: "Normalized report validates against accounting_report.schema.json.",
        details: {}
      }
    ];
  }

  return (validate.errors ?? []).slice(0, 25).map((error) => ({
    check_name: "json_schema",
    status: "failed",
    severity: "error",
    message: error.message ?? "JSON schema validation failed.",
    details: { path: error.instancePath, schemaPath: error.schemaPath }
  }));
}

