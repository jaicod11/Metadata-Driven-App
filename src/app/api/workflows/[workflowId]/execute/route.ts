// src/app/api/workflows/[workflowId]/execute/route.ts
import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/auth-options";
import { getWorkflow } from "@/lib/db/queries/workflows";
import { getApp } from "@/lib/db/queries/apps";
import { executeWorkflow } from "@/lib/workflow/engine";
import { apiOk, apiError, apiUnauthorized, apiNotFound, apiServerError } from "@/lib/utils/api-response";

type Params = { params: { workflowId: string } };

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return apiUnauthorized();

    // appId must be in the body or query
    const url = new URL(req.url);
    const appId = url.searchParams.get("appId");
    if (!appId) return apiError("?appId= is required", 400);

    const app = await getApp(appId, session.user.id);
    if (!app) return apiNotFound("App");

    const wf = await getWorkflow(params.workflowId, appId);
    if (!wf) return apiNotFound("Workflow");

    let triggerData: Record<string, unknown> = {};
    try {
      const body = await req.json();
      if (body && typeof body === "object") triggerData = body;
    } catch { /* no body is fine */ }

    const result = await executeWorkflow({
      workflowId: params.workflowId,
      appId,
      triggerData,
    });

    return apiOk(result, result.status === "success" ? 200 : 422);
  } catch (err) {
    console.error("[POST /api/workflows/:id/execute]", err);
    return apiServerError();
  }
}
