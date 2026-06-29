import * as XLSX from "xlsx";

export type WorkbookRow = Record<string, unknown> & {
  _sheet_name: string;
  _row_number: number;
};

export function loadXlsxRows(bytes: Buffer): WorkbookRow[] {
  const workbook = XLSX.read(bytes, { type: "buffer", cellDates: false });
  const rows: WorkbookRow[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: null });
    const headerInfo = findHeader(matrix);
    if (!headerInfo) {
      continue;
    }

    const { headerIndex, headers } = headerInfo;
    for (let rowIndex = headerIndex + 1; rowIndex < matrix.length; rowIndex += 1) {
      const sourceRow = matrix[rowIndex] ?? [];
      const record: WorkbookRow = { _sheet_name: sheetName, _row_number: rowIndex + 1 };
      let empty = true;
      headers.forEach((header, index) => {
        if (!header) {
          return;
        }
        const value = sourceRow[index] ?? null;
        if (value !== null && value !== "") {
          empty = false;
        }
        record[header] = value;
      });
      if (!empty) {
        rows.push(record);
      }
    }
  }

  return rows;
}

function findHeader(matrix: unknown[][]): { headerIndex: number; headers: string[] } | null {
  for (let index = 0; index < Math.min(matrix.length, 30); index += 1) {
    const headers = (matrix[index] ?? []).map((cell) => (cell === null || cell === undefined ? "" : String(cell).trim()));
    const lowered = new Set(headers.filter(Boolean).map((header) => header.toLowerCase()));
    if (lowered.has("title") && lowered.has("studio") && (lowered.has("total") || lowered.has("amount"))) {
      return { headerIndex: index, headers };
    }
    if (lowered.has("item id") && lowered.has("title") && lowered.has("studio") && lowered.has("total")) {
      return { headerIndex: index, headers };
    }
  }
  return null;
}

