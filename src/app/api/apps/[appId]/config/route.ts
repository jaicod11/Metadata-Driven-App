// src/app/api/apps/[appId]/config/route.ts
import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/auth-options";
import { getApp, updateAppConfig } from "@/lib/db/queries/apps";
import { parseConfig } from "@/lib/runtime/schema-parser";
import {
  apiOk,
  apiError,
  apiUnauthorized,
  apiNotFound,
  apiServerError,
} from "@/lib/utils/api-response";

type Params = { params: { appId: string } };

// GET /api/apps/:appId/config — return raw config + parse result
export async function GET(_: NextRequest, { params }: Params) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return apiUnauthorized();

    const app = await getApp(params.appId, session.user.id);
    if (!app) return apiNotFound("App");

    const parsed = parseConfig(app.config);
    return apiOk({ raw: app.config, parsed });
  } catch (err) {
    console.error("[GET /api/apps/:id/config]", err);
    return apiServerError();
  }
}

// PUT /api/apps/:appId/config — validate and save a new config
export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return apiUnauthorized();

    const app = await getApp(params.appId, session.user.id);
    if (!app) return apiNotFound("App");

    let rawConfig: unknown;
    try {
      rawConfig = await req.json();
    } catch {
      return apiError("Request body must be valid JSON", 400);
    }

    const result = parseConfig(rawConfig);

    // Save even if there are warnings — only block on hard errors
    if (!result.valid || !result.config) {
      return apiError("Config has validation errors", 422, result.errors);
    }

    await updateAppConfig(params.appId, session.user.id, result.config);

    return apiOk({
      config: result.config,
      warnings: result.warnings,
    });
  } catch (err) {
    console.error("[PUT /api/apps/:id/config]", err);
    return apiServerError();
  }
}
