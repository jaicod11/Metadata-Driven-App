// src/app/api/runtime/[appId]/[entity]/route.ts
//
// This single file handles ALL CRUD for every entity in every app.
// GET    /api/runtime/:appId/:entity          → list records (paginated)
//        ?page= &limit=          page through the result (total comes back in meta)
//        &sort= &dir=            order by a stored field, createdAt or updatedAt
//        &q=                     text search across the role's readable text fields
//        &filter.<field>=<value> exact match on a stored field
//        &filterField= &filterValue=  single-filter form used by hasMany lists
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
  EntityFilter,
  EntitySort,
  MAX_PAGE_SIZE,
  listEntityRecords,
  getEntityRecord,
  createEntityRecord,
  updateEntityRecord,
  deleteEntityRecord,
} from "@/lib/db/queries/entities";
import { getApp } from "@/lib/db/queries/apps";
import { recordAuditEntry } from "@/lib/db/queries/audit";
import { AuditAction, buildAuditDiff } from "@/lib/runtime/audit";
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
  readableStoredFields,
  resolveRole,
  writableData,
} from "@/lib/runtime/permissions";
import { AppConfig, EntityConfig, FieldConfig, FieldType } from "@/types/config.types";

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

/**
 * Log a mutation that has already committed. The diff is built against the
 * acting role's readable stored fields, so the trail can never name a field
 * this caller wasn't allowed to read — see src/lib/runtime/audit.ts.
 */
async function auditMutation(
  ctx: { config: AppConfig; entity: EntityConfig; role: ActiveRole },
  user: { id: string; email?: string | null },
  appId: string,
  action: AuditAction,
  recordId: string,
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null
) {
  await recordAuditEntry({
    appId,
    entity: ctx.entity.name,
    recordId,
    action,
    userId: user.id,
    userEmail: user.email ?? null,
    diff: buildAuditDiff(ctx.config, ctx.entity, ctx.role, action, before, after),
  });
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

// ── Query params: filtering, sorting, searching ───────────────────────────────

/** Types whose values read as text, and so are worth searching. */
const SEARCHABLE_TYPES: FieldType[] = [
  "string",
  "textarea",
  "email",
  "url",
  "select",
];

/** Real columns every reader gets back, so they are always sortable. */
const SORTABLE_COLUMNS = ["createdAt", "updatedAt"] as const;

/**
 * The fields a role may filter, sort or search on: exactly the ones it may
 * read, minus the ones that don't exist in the database.
 *
 * Computed fields are derived in readableRecord() and have no column or JSONB
 * key to query. hasMany is stored on the child. And anything visibleFields()
 * drops — a field the role can't see, or one whose relation target it can't
 * read — must not be queryable either, or a filter would become an oracle for
 * values the role is not allowed to read.
 */
function queryableFields(
  config: AppConfig,
  entity: EntityConfig,
  role: ActiveRole
): Map<string, FieldConfig> {
  const usable = readableStoredFields(config, entity, role);
  return new Map(usable.map((field) => [field.name, field]));
}

/** Match the filter value's JSON type to the field's, so containment matches. */
function coerceFilterValue(field: FieldConfig, raw: string): unknown {
  if (field.type === "number") {
    const value = Number(raw);
    return isNaN(value) ? raw : value;
  }
  if (field.type === "boolean") {
    if (raw === "true") return true;
    if (raw === "false") return false;
  }
  return raw;
}

const rejectField = (name: string, verb: string) =>
  apiError(
    `Cannot ${verb} "${name}" — no such stored field, or your role cannot read it`,
    400
  );

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

    const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1") || 1);
    const limit = Math.min(
      Math.max(1, parseInt(url.searchParams.get("limit") ?? "20") || 20),
      MAX_PAGE_SIZE
    );

    // Every field named by a query param is checked against this map, so a role
    // can only query what it can already read.
    const queryable = queryableFields(ctx.config, ctx.entity, ctx.role);

    // ── filters ──────────────────────────────────────────────────────────────
    const filters: EntityFilter[] = [];

    for (const [key, raw] of url.searchParams.entries()) {
      if (!key.startsWith("filter.")) continue;
      const name = key.slice("filter.".length);
      const field = queryable.get(name);
      if (!field) return rejectField(name, "filter on");
      filters.push({ field: name, value: coerceFilterValue(field, raw) });
    }

    // ?filterField=&filterValue= — how a hasMany list finds its children.
    const filterField = url.searchParams.get("filterField");
    const filterValue = url.searchParams.get("filterValue");
    if (filterField && filterValue !== null) {
      const field = queryable.get(filterField);
      if (!field) return rejectField(filterField, "filter on");
      filters.push({
        field: filterField,
        value: coerceFilterValue(field, filterValue),
      });
    }

    // ── sort ─────────────────────────────────────────────────────────────────
    const sortParam = url.searchParams.get("sort");
    const direction = url.searchParams.get("dir") === "asc" ? "asc" : "desc";
    let sort: EntitySort | undefined;

    if (sortParam) {
      const column = SORTABLE_COLUMNS.find((c) => c === sortParam);
      if (column) {
        sort = { column, direction };
      } else {
        const field = queryable.get(sortParam);
        if (!field) return rejectField(sortParam, "sort by");
        sort = {
          field: sortParam,
          direction,
          numeric: field.type === "number",
        };
      }
    }

    // ── search ───────────────────────────────────────────────────────────────
    const term = url.searchParams.get("q")?.trim();
    const search = term
      ? {
          term,
          // Only the readable text fields — never a hidden one, so a search
          // cannot confirm a value the role may not see.
          fields: Array.from(queryable.values())
            .filter((field) => SEARCHABLE_TYPES.includes(field.type))
            .map((field) => field.name),
        }
      : undefined;

    const result = await listEntityRecords(appId, entityName, {
      page,
      limit,
      filters,
      sort,
      search,
    });

    // meta carries the total count so the client can paginate.
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

    await auditMutation(
      ctx,
      { id: session.user.id, email: session.user.email },
      appId,
      "create",
      String(record.id),
      null,
      record
    );

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

    // Read the record first so the audit entry can diff old against new.
    const before = await getEntityRecord(appId, entityName, id);

    const updated = await updateEntityRecord(
      appId,
      entityName,
      id,
      writableData(ctx.config, ctx.entity, ctx.role, validation.data!, "update")
    );
    if (!updated) return apiNotFound("Record");

    await auditMutation(
      ctx,
      { id: session.user.id, email: session.user.email },
      appId,
      "update",
      id,
      before,
      updated
    );

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

    // The record has to be read before it is gone, to log what was removed.
    const before = await getEntityRecord(appId, entityName, id);

    const deleted = await deleteEntityRecord(appId, entityName, id);
    if (!deleted) return apiNotFound("Record");

    await auditMutation(
      ctx,
      { id: session.user.id, email: session.user.email },
      appId,
      "delete",
      id,
      before,
      null
    );

    return apiOk({ deleted: true });
  } catch (err) {
    console.error("[RUNTIME DELETE]", err);
    return apiServerError();
  }
}
