// src/app/api/runtime/[appId]/[entity]/audit/route.ts
//
// GET /api/runtime/:appId/:entity/audit?page=&limit=
//   → recent audit entries for one entity, newest first.
//
// Read-only. Gated by the "auditLog" entity permission, resolved from the
// config the same way every other verb is.

import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/auth-options";
import { getApp } from "@/lib/db/queries/apps";
import { parseConfig } from "@/lib/runtime/schema-parser";
import {
  MAX_AUDIT_PAGE_SIZE,
  listAuditEntries,
} from "@/lib/db/queries/audit";
import { auditableFieldNames, redactAuditDiff } from "@/lib/runtime/audit";
import { can, resolveRole } from "@/lib/runtime/permissions";
import {
  apiOk,
  apiError,
  apiUnauthorized,
  apiForbidden,
  apiNotFound,
  apiServerError,
} from "@/lib/utils/api-response";
import { EntityConfig } from "@/types/config.types";

type Params = { params: { appId: string; entity: string } };

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return apiUnauthorized();

    const { appId, entity: entityName } = params;

    const app = await getApp(appId, session.user.id);
    if (!app) return apiNotFound("App");

    const parsed = parseConfig(app.config);
    if (!parsed.valid || !parsed.config) {
      return apiError("App config is invalid", 422, parsed.errors);
    }

    const entity = parsed.config.entities.find(
      (e: EntityConfig) => e.name === entityName
    );
    if (!entity) {
      return apiError(
        `Entity "${entityName}" is not defined in this app's config`,
        404
      );
    }

    const role = resolveRole(parsed.config, {
      id: session.user.id,
      email: session.user.email,
      isOwner: app.userId === session.user.id,
    });

    if (!can(entity, role, "auditLog")) {
      return apiForbidden(
        `Your role ${role.name ? `("${role.name}") ` : ""}cannot view the audit log for ${
          entity.label ?? entity.name
        }`
      );
    }

    const url = new URL(req.url);
    const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1") || 1);
    const limit = Math.min(
      Math.max(1, parseInt(url.searchParams.get("limit") ?? "20") || 20),
      MAX_AUDIT_PAGE_SIZE
    );

    const { entries, meta } = await listAuditEntries(appId, entityName, {
      page,
      limit,
    });

    // Entries were written against the *actor's* visibility; narrow them again
    // to this reader's, so the log can't show a field the record wouldn't.
    const allowed = auditableFieldNames(parsed.config, entity, role);

    return apiOk({
      entries: entries.map((entry) => ({
        id: entry.id,
        entity: entry.entity,
        recordId: entry.recordId,
        action: entry.action,
        userId: entry.userId,
        userEmail: entry.userEmail,
        createdAt: entry.createdAt,
        diff: redactAuditDiff(entry.diff, allowed),
      })),
      meta,
    });
  } catch (err) {
    console.error("[RUNTIME AUDIT GET]", err);
    return apiServerError();
  }
}
