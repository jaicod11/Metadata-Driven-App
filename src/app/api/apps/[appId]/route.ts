// src/app/api/apps/[appId]/route.ts
import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/auth-options";
import { getApp, updateAppConfig, deleteApp } from "@/lib/db/queries/apps";
import { parseConfig } from "@/lib/runtime/schema-parser";
import {
  apiOk,
  apiError,
  apiUnauthorized,
  apiNotFound,
  apiServerError,
} from "@/lib/utils/api-response";

type Params = { params: { appId: string } };

export async function GET(_: NextRequest, { params }: Params) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return apiUnauthorized();

    const app = await getApp(params.appId, session.user.id);
    if (!app) return apiNotFound("App");

    return apiOk(app);
  } catch (err) {
    console.error("[GET /api/apps/:id]", err);
    return apiServerError();
  }
}

export async function DELETE(_: NextRequest, { params }: Params) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return apiUnauthorized();

    const app = await getApp(params.appId, session.user.id);
    if (!app) return apiNotFound("App");

    await deleteApp(params.appId, session.user.id);
    return apiOk({ deleted: true });
  } catch (err) {
    console.error("[DELETE /api/apps/:id]", err);
    return apiServerError();
  }
}
