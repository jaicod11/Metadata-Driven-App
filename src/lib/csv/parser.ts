// src/lib/csv/parser.ts
import Papa from "papaparse";

export interface ParsedCsvRow {
  rowNumber: number;
  data: Record<string, string>;
}

export interface ParsedCsvResult {
  headers: string[];
  rows: ParsedCsvRow[];
  errors: { row: number; message: string }[];
}

/** Parse a CSV string (server-side) into rows and headers */
export function parseCsvString(csvText: string): ParsedCsvResult {
  const result = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
    transform: (value) => value.trim(),
  });

  const headers: string[] = result.meta.fields ?? [];
  const rows: ParsedCsvRow[] = result.data.map((row, i) => ({
    rowNumber: i + 1,
    data: row,
  }));

  const errors = result.errors.map((e) => ({
    row: e.row ?? 0,
    message: e.message,
  }));

  return { headers, rows, errors };
}

/** Parse a File object (browser-side) — returns a Promise */
export function parseCsvFile(file: File): Promise<ParsedCsvResult> {
  return new Promise((resolve, reject) => {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim(),
      transform: (value) => value.trim(),
      complete: (result) => {
        resolve({
          headers: result.meta.fields ?? [],
          rows: result.data.map((row, i) => ({ rowNumber: i + 1, data: row })),
          errors: result.errors.map((e) => ({
            row: e.row ?? 0,
            message: e.message,
          })),
        });
      },
      error: (err) => reject(err),
    });
  });
}
