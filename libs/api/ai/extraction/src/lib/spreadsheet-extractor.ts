import * as XLSX from "xlsx";

// Handles both legacy .xls (BIFF) and .xlsx (OOXML) workbooks.
export function extractSpreadsheetText(buffer: Buffer): string {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheets = workbook.SheetNames.map((name) =>
    XLSX.utils.sheet_to_csv(workbook.Sheets[name]),
  );
  return sheets.join("\n\n").trim();
}
