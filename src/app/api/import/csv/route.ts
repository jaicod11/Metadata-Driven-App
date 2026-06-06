// src/app/api/import/csv/route.ts
//
// POST /api/import/csv
// Body: multipart/form-data with:
//   - file: the CSV file
//   - appId: string
//   - entity: string (entity name)
//   - mapping: JSON string of { csvHeader: entityFieldName | null }

import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/auth-options";
import { getApp } from "@/lib/db/queries/apps";
import { parseConfig } from "@/lib/runtime/schema-parser";
import { parseCsvString } from "@/lib/csv/parser";
import { importCsvRows } from "@/lib/csv/importer";
import { apiOk, apiError, apiUnauthorized, apiNotFound, apiServerError } from "@/lib/utils/api-response";

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return apiUnauthorized();

    const formData = await req.formData();

    const file = formData.get("file") as File | null;
    const appId = formData.get("appId") as string | null;
    const entityName = formData.get("entity") as string | null;
    const mappingStr = formData.get("mapping") as string | null;

    if (!file)       return apiError("'file' is required", 400);
    if (!appId)      return apiError("'appId' is required", 400);
    if (!entityName) return apiError("'entity' is required", 400);
    if (!mappingStr) return apiError("'mapping' is required", 400);

    // Validate file type
    if (!file.name.endsWith(".csv") && file.type !== "text/csv") {
      return apiError("Only CSV files are supported", 400);
    }

    // Max 5 MB
    if (file.size > 5 * 1024 * 1024) {
      return apiError("File too large. Maximum size is 5 MB", 400);
    }

    let mapping: Record<string, string | null>;
    try {
      mapping = JSON.parse(mappingStr);
    } catch {
      return apiError("'mapping' must be valid JSON", 400);
    }

    // Verify app ownership
    const app = await getApp(appId, session.user.id);
    if (!app) return apiNotFound("App");

    // Parse the app config to get the entity schema
    const configResult = parseConfig(app.config);
    if (!configResult.valid || !configResult.config) {
      return apiError("App config is invalid", 422);
    }

    const entity = configResult.config.entities.find((e) => e.name === entityName);
    if (!entity) {
      return apiError(`Entity "${entityName}" not found in this app's config`, 404);
    }

    // Parse CSV text
    const csvText = await file.text();
    const { rows, errors: parseErrors } = parseCsvString(csvText);

    if (rows.length === 0) {
      return apiError("The CSV file is empty or has no data rows", 400);
    }

    // Import
    const result = await importCsvRows(appId, entity, rows, mapping);

    return apiOk({
      ...result,
      parseErrors,
    }, 201);
  } catch (err) {
    console.error("[POST /api/import/csv]", err);
    return apiServerError();
  }
}
