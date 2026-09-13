// src/app/api/widgets/route.ts
//
// GET /api/widgets?appId=<id>&path=<page path>
//   → the computed values for one dashboard page's widgets.
//
// Not mounted under /api/runtime/[appId]/ because a static "widgets" segment
// there would shadow an entity actually named "widgets" and break its CRUD.
//
// The client names a page, never a query: what to count, sum or group comes
// from the stored config, so no request can ask for an aggregate over a field
// its role may not read. Widgets that fail the check are absent from the
// response entirely — never present with a null value, which would still
// confirm the widget exists and has something behind it.

import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/auth-options";
import { getApp } from "@/lib/db/queries/apps";
import { parseConfig } from "@/lib/runtime/schema-parser";
import {
  AggregateOperation,
  EntityFilter,
  aggregateEntityRecords,
  countEntityRecords,
  groupEntityRecords,
} from "@/lib/db/queries/entities";
import { resolveRole } from "@/lib/runtime/permissions";
import { visibleWidgets, widgetTitle } from "@/lib/runtime/widgets";
import { EntityConfig, WidgetConfig } from "@/types/config.types";
import {
  apiOk,
  apiError,
  apiUnauthorized,
  apiNotFound,
  apiServerError,
} from "@/lib/utils/api-response";

/** Match a filter value's JSON type to the field's, so containment matches. */
function coerceFilters(
  widget: WidgetConfig,
  entity: EntityConfig
): EntityFilter[] {
  return Object.entries(widget.filter ?? {}).map(([name, value]) => {
    const field = entity.fields.find((f) => f.name === name);
    if (field?.type === "number" && typeof value !== "number") {
      const parsed = Number(value);
      return { field: name, value: isNaN(parsed) ? value : parsed };
    }
    return { field: name, value };
  });
}

// Reads the session, so there is nothing to prerender. Without this the build
// attempts a static render and the handler's own try/catch swallows Next's
// dynamic-usage signal as a 500.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return apiUnauthorized();

    const url = new URL(req.url);
    const appId = url.searchParams.get("appId");
    const pagePath = url.searchParams.get("path");
    if (!appId) return apiError("Query param ?appId= is required", 400);
    if (!pagePath) return apiError("Query param ?path= is required", 400);

    const app = await getApp(appId, session.user.id);
    if (!app) return apiNotFound("App");

    const parsed = parseConfig(app.config);
    if (!parsed.valid || !parsed.config) {
      return apiError("App config is invalid", 422, parsed.errors);
    }

    const page = parsed.config.pages.find((p) => p.path === pagePath);
    if (!page) return apiNotFound("Page");

    const role = resolveRole(parsed.config, {
      id: session.user.id,
      email: session.user.email,
      isOwner: app.userId === session.user.id,
    });

    // The gate: everything below runs only for widgets this role may see.
    const permitted = visibleWidgets(parsed.config, page, role);

    const widgets = await Promise.all(
      permitted.map(async ({ index, widget, entity }) => {
        const filters = coerceFilters(widget, entity);
        const common = {
          index,
          type: widget.type,
          title: widgetTitle(widget, entity),
        };

        if (widget.type === "count") {
          return {
            ...common,
            value: await countEntityRecords(appId, entity.name, { filters }),
          };
        }

        if (widget.type === "aggregate") {
          return {
            ...common,
            op: widget.op ?? "sum",
            field: widget.field,
            value: await aggregateEntityRecords(appId, entity.name, {
              filters,
              field: widget.field!,
              op: (widget.op ?? "sum") as AggregateOperation,
            }),
          };
        }

        return {
          ...common,
          chart: widget.chart ?? "bar",
          field: widget.field,
          points: await groupEntityRecords(appId, entity.name, {
            filters,
            field: widget.field!,
            limit: widget.limit,
          }),
        };
      })
    );

    return apiOk({ widgets });
  } catch (err) {
    console.error("[WIDGETS GET]", err);
    return apiServerError();
  }
}
