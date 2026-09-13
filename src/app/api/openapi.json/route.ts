// src/app/api/openapi.json/route.ts
//
// GET /api/openapi.json?appId=<id>
//   → an OpenAPI 3.0 document for that app's runtime API.
//
// Read-only and derived: it reports what the config already implies and changes
// nothing. Same gate as the rest of the runtime — a session, then ownership
// through App.userId.

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/auth-options";
import { getApp } from "@/lib/db/queries/apps";
import { parseConfig } from "@/lib/runtime/schema-parser";
import { buildOpenApiSpec } from "@/lib/runtime/openapi";
import {
  apiError,
  apiUnauthorized,
  apiNotFound,
  apiServerError,
} from "@/lib/utils/api-response";

// The handler reads the session, so there is nothing to prerender. Without
// this, the build attempts a static render and the handler's own try/catch
// swallows Next's dynamic-usage signal as a 500.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return apiUnauthorized();

    const url = new URL(req.url);
    const appId = url.searchParams.get("appId");
    if (!appId) {
      return apiError("Query param ?appId= is required", 400);
    }

    const app = await getApp(appId, session.user.id);
    if (!app) return apiNotFound("App");

    const parsed = parseConfig(app.config);
    if (!parsed.valid || !parsed.config) {
      return apiError("App config is invalid", 422, parsed.errors);
    }

    const spec = buildOpenApiSpec(parsed.config, {
      appId,
      serverUrl: url.origin,
    });

    // Deliberately not apiOk(): an OpenAPI document has to be served as itself,
    // not wrapped in the { success, data } envelope, or no OpenAPI client can
    // read it. Errors above still use the uniform envelope.
    return NextResponse.json(spec, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    console.error("[OPENAPI GET]", err);
    return apiServerError();
  }
}
