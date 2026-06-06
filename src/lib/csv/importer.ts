// src/lib/csv/importer.ts
//
// Takes parsed CSV rows + a column mapping + entity config,
// validates each row, and bulk-inserts valid rows into AppData.

import { EntityConfig } from "@/types/config.types";
import { validateEntityData } from "@/lib/runtime/validator";
import { bulkCreateEntityRecords } from "@/lib/db/queries/entities";
import { prisma } from "@/lib/db/prisma";
import { ParsedCsvRow } from "./parser";

export interface ColumnMapping {
  /** Maps CSV header → entity field name */
  [csvHeader: string]: string | null; // null = skip this column
}

export interface ImportResult {
  importId: string;
  total: number;
  inserted: number;
  skipped: number;
  errors: { row: number; message: string }[];
}

export async function importCsvRows(
  appId: string,
  entity: EntityConfig,
  rows: ParsedCsvRow[],
  columnMapping: ColumnMapping
): Promise<ImportResult> {
  const errors: { row: number; message: string }[] = [];
  const validRows: Record<string, unknown>[] = [];

  // ── Create a tracking record ───────────────────────────────────────────────
  const importRecord = await prisma.csvImport.create({
    data: {
      appId,
      entity: entity.name,
      fileName: "upload.csv",
      rowCount: rows.length,
      status: "processing",
    },
  });

  // ── Validate each row ──────────────────────────────────────────────────────
  for (const { rowNumber, data } of rows) {
    // Apply column mapping: CSV header → entity field name
    const mapped: Record<string, unknown> = {};
    for (const [csvCol, entityField] of Object.entries(columnMapping)) {
      if (entityField && data[csvCol] !== undefined) {
        mapped[entityField] = data[csvCol];
      }
    }

    const validation = validateEntityData(mapped, entity);
    if (validation.success && validation.data) {
      validRows.push(validation.data);
    } else {
      errors.push({
        row: rowNumber,
        message: validation.errors?.join("; ") ?? "Validation failed",
      });
    }
  }

  // ── Bulk insert valid rows ─────────────────────────────────────────────────
  let inserted = 0;
  if (validRows.length > 0) {
    const result = await bulkCreateEntityRecords(appId, entity.name, validRows);
    inserted = result.count;
  }

  // ── Update tracking record ─────────────────────────────────────────────────
  await prisma.csvImport.update({
    where: { id: importRecord.id },
    data: {
      status: errors.length === rows.length ? "failed" : "done",
      rowCount: inserted,
      errors: errors.length > 0 ? (errors as any) : undefined,
    },
  });

  return {
    importId: importRecord.id,
    total: rows.length,
    inserted,
    skipped: errors.length,
    errors,
  };
}
