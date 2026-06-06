// src/app/api/runtime/[appId]/[entity]/route.ts
//
// This single file handles ALL CRUD for every entity in every app.
// GET    /api/runtime/:appId/:entity          → list records (paginated)
// GET    /api/runtime/:appId/:entity?id=xxx   → get single record
// POST   /api/runtime/:appId/:entity          → create record
// PUT    /api/runtime/:appId/:entity?id=xxx   → update record
// DELETE /api/runtime/:appId/:entity?id=xxx   → delete record

import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/auth-options";
import { parseConfig } from "@/lib/runtime/schema-parser";
import { validateEntityData } from "@/lib/runtime/validator";
import {
  listEntityRecords,
  getEntityRecord,
  createEntityRecord,
  updateEntityRecord,
  deleteEntityRecord,
} from "@/lib/db/queries/entities";
import { getApp } from "@/lib/db/queries/apps";
import {
  apiOk,
  apiError,
  apiUnauthorized,
  apiNotFound,
  apiServerError,
} from "@/lib/utils/api-response";
import { AppConfig, EntityConfig } from "@/types/config.types";

type Params = { params: { appId: string; entity: string } };

// ── Shared: resolve app + entity config ───────────────────────────────────────

async function resolveContext(appId: string, entityName: string, userId: string) {
  const app = await getApp(appId, userId);
  if (!app) return { error: apiNotFound("App") };

  const parsed = parseConfig(app.config);
  if (!parsed.valid || !parsed.config) {
    return { error: apiError("App config is invalid", 422) };
  }

  const entity = parsed.config.entities.find(
    (e: EntityConfig) => e.name === entityName
  );
  if (!entity) {
    return {
      error: apiError(
        `Entity "${entityName}" is not defined in this app's config`,
        404
      ),
    };
  }

  return { config: parsed.config as AppConfig, entity };
}

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return apiUnauthorized();

    const { appId, entity: entityName } = params;
    const ctx = await resolveContext(appId, entityName, session.user.id);
    if ("error" in ctx) return ctx.error;

    const url = new URL(req.url);
    const id = url.searchParams.get("id");

    if (id) {
      const record = await getEntityRecord(appId, entityName, id);
      if (!record) return apiNotFound("Record");
      return apiOk(record);
    }

    const page = parseInt(url.searchParams.get("page") ?? "1");
    const limit = parseInt(url.searchParams.get("limit") ?? "20");
    const result = await listEntityRecords(appId, entityName, { page, limit });

    return apiOk(result);
  } catch (err) {
    console.error("[RUNTIME GET]", err);
    return apiServerError();
  }
}

// ── POST ──────────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return apiUnauthorized();

    const { appId, entity: entityName } = params;
    const ctx = await resolveContext(appId, entityName, session.user.id);
    if ("error" in ctx) return ctx.error;

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return apiError("Request body must be valid JSON", 400);
    }

    const validation = validateEntityData(body, ctx.entity);
    if (!validation.success) {
      return apiError("Validation failed", 422, validation.errors);
    }

    const record = await createEntityRecord(appId, entityName, validation.data!);
    return apiOk(record, 201);
  } catch (err) {
    console.error("[RUNTIME POST]", err);
    return apiServerError();
  }
}

// ── PUT ───────────────────────────────────────────────────────────────────────

export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return apiUnauthorized();

    const { appId, entity: entityName } = params;
    const id = new URL(req.url).searchParams.get("id");
    if (!id) return apiError("Query param ?id= is required", 400);

    const ctx = await resolveContext(appId, entityName, session.user.id);
    if ("error" in ctx) return ctx.error;

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return apiError("Request body must be valid JSON", 400);
    }

    // Partial validation: only validate fields that are present in the patch
    const validation = validateEntityData(body, ctx.entity);
    if (!validation.success) {
      return apiError("Validation failed", 422, validation.errors);
    }

    const updated = await updateEntityRecord(
      appId,
      entityName,
      id,
      validation.data!
    );
    if (!updated) return apiNotFound("Record");

    return apiOk(updated);
  } catch (err) {
    console.error("[RUNTIME PUT]", err);
    return apiServerError();
  }
}

// ── DELETE ────────────────────────────────────────────────────────────────────

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return apiUnauthorized();

    const { appId, entity: entityName } = params;
    const id = new URL(req.url).searchParams.get("id");
    if (!id) return apiError("Query param ?id= is required", 400);

    const ctx = await resolveContext(appId, entityName, session.user.id);
    if ("error" in ctx) return ctx.error;

    const deleted = await deleteEntityRecord(appId, entityName, id);
    if (!deleted) return apiNotFound("Record");

    return apiOk({ deleted: true });
  } catch (err) {
    console.error("[RUNTIME DELETE]", err);
    return apiServerError();
  }
}
