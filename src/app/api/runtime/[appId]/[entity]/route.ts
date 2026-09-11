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
import { validateEntityRecord } from "@/lib/runtime/validator.server";
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
  apiForbidden,
  apiNotFound,
  apiServerError,
} from "@/lib/utils/api-response";
import {
  ActiveRole,
  PermissionAction,
  can,
  readableRecord,
  resolveRole,
  writableData,
} from "@/lib/runtime/permissions";
import { AppConfig, EntityConfig } from "@/types/config.types";

type Params = { params: { appId: string; entity: string } };

// ── Shared: resolve app + entity config ───────────────────────────────────────

async function resolveContext(
  appId: string,
  entityName: string,
  user: { id: string; email?: string | null }
) {
  const app = await getApp(appId, user.id);
  if (!app) return { error: apiNotFound("App") };

  const parsed = parseConfig(app.config);
  if (!parsed.valid || !parsed.config) {
    return { error: apiError("App config is invalid", 422, parsed.errors) };
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

  // The role is resolved here, server-side, from the session — the client's
  // copy is only ever used for rendering.
  const role = resolveRole(parsed.config, {
    id: user.id,
    email: user.email,
    isOwner: app.userId === user.id,
  });

  return { config: parsed.config as AppConfig, entity, role };
}

/** 403 unless the role may perform `action` on this entity. */
function denyUnless(
  entity: EntityConfig,
  role: ActiveRole,
  action: PermissionAction
) {
  if (can(entity, role, action)) return null;
  return apiForbidden(
    `Your role ${role.name ? `("${role.name}") ` : ""}cannot ${action} ${
      entity.label ?? entity.name
    } records`
  );
}

// ── GET ───────────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return apiUnauthorized();

    const { appId, entity: entityName } = params;
    const ctx = await resolveContext(appId, entityName, {
      id: session.user.id,
      email: session.user.email,
    });
    if ("error" in ctx) return ctx.error;

    const denied = denyUnless(ctx.entity, ctx.role, "read");
    if (denied) return denied;

    const url = new URL(req.url);
    const id = url.searchParams.get("id");

    // Fields this role cannot see are stripped before responding, so hiding
    // them is not merely a UI decision.
    const visible = (record: Record<string, unknown>) =>
      readableRecord(ctx.config, ctx.entity, ctx.role, record);

    if (id) {
      const record = await getEntityRecord(appId, entityName, id);
      if (!record) return apiNotFound("Record");
      return apiOk(visible(record));
    }

    const page = parseInt(url.searchParams.get("page") ?? "1");
    const limit = parseInt(url.searchParams.get("limit") ?? "20");

    // ?filterField=&filterValue= — how a hasMany list finds its children.
    const filterField = url.searchParams.get("filterField");
    const filterValue = url.searchParams.get("filterValue");
    const filter =
      filterField && filterValue !== null
        ? { field: filterField, value: filterValue }
        : undefined;

    const result = await listEntityRecords(appId, entityName, {
      page,
      limit,
      filter,
    });

    return apiOk({ ...result, records: result.records.map(visible) });
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
    const ctx = await resolveContext(appId, entityName, {
      id: session.user.id,
      email: session.user.email,
    });
    if ("error" in ctx) return ctx.error;

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return apiError("Request body must be valid JSON", 400);
    }

    const denied = denyUnless(ctx.entity, ctx.role, "create");
    if (denied) return denied;

    const validation = await validateEntityRecord(body, ctx.entity, {
      appId,
      entity: entityName,
    });
    if (!validation.success) {
      return apiError("Validation failed", 400, validation.fieldErrors);
    }

    // Values for fields this role cannot write are discarded, not trusted.
    const data = writableData(
      ctx.config,
      ctx.entity,
      ctx.role,
      validation.data!,
      "create"
    );

    const record = await createEntityRecord(appId, entityName, data);
    return apiOk(readableRecord(ctx.config, ctx.entity, ctx.role, record), 201);
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

    const ctx = await resolveContext(appId, entityName, {
      id: session.user.id,
      email: session.user.email,
    });
    if ("error" in ctx) return ctx.error;

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return apiError("Request body must be valid JSON", 400);
    }

    const denied = denyUnless(ctx.entity, ctx.role, "update");
    if (denied) return denied;

    // The record keeps its own value where a field is marked unique.
    const validation = await validateEntityRecord(body, ctx.entity, {
      appId,
      entity: entityName,
      excludeId: id,
    });
    if (!validation.success) {
      return apiError("Validation failed", 400, validation.fieldErrors);
    }

    const updated = await updateEntityRecord(
      appId,
      entityName,
      id,
      writableData(ctx.config, ctx.entity, ctx.role, validation.data!, "update")
    );
    if (!updated) return apiNotFound("Record");

    return apiOk(readableRecord(ctx.config, ctx.entity, ctx.role, updated));
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

    const ctx = await resolveContext(appId, entityName, {
      id: session.user.id,
      email: session.user.email,
    });
    if ("error" in ctx) return ctx.error;

    const denied = denyUnless(ctx.entity, ctx.role, "delete");
    if (denied) return denied;

    const deleted = await deleteEntityRecord(appId, entityName, id);
    if (!deleted) return apiNotFound("Record");

    return apiOk({ deleted: true });
  } catch (err) {
    console.error("[RUNTIME DELETE]", err);
    return apiServerError();
  }
}
