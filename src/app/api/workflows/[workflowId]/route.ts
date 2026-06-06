// src/app/api/workflows/[workflowId]/route.ts
import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth/auth-options";
import { getApp } from "@/lib/db/queries/apps";
import { getWorkflow, updateWorkflow, deleteWorkflow, getExecutions } from "@/lib/db/queries/workflows";
import { apiOk, apiError, apiUnauthorized, apiNotFound, apiServerError } from "@/lib/utils/api-response";

type Params = { params: { workflowId: string } };

const updateSchema = z.object({
  appId: z.string(),
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  isActive: z.boolean().optional(),
  trigger: z.object({
    type: z.enum(["onSubmit","onUpdate","onDelete","schedule","manual"]),
    entity: z.string().optional(),
    cron: z.string().optional(),
  }).optional(),
  steps: z.array(z.object({
    type: z.enum(["sendEmail","callWebhook","transform","notify","condition"]),
    name: z.string().optional(),
    config: z.record(z.unknown()),
  })).optional(),
});

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return apiUnauthorized();
    const appId = new URL(req.url).searchParams.get("appId");
    if (!appId) return apiError("?appId= required", 400);
    const app = await getApp(appId, session.user.id);
    if (!app) return apiNotFound("App");
    const wf = await getWorkflow(params.workflowId, appId);
    if (!wf) return apiNotFound("Workflow");
    const executions = await getExecutions(params.workflowId, 10);
    return apiOk({ ...wf, executions });
  } catch (err) {
    console.error("[GET workflow]", err);
    return apiServerError();
  }
}

export async function PUT(req: NextRequest, { params }: Params) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return apiUnauthorized();
    const body = await req.json().catch(() => ({}));
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) return apiError("Validation failed", 400, parsed.error.errors);
    const { appId, ...data } = parsed.data;
    const app = await getApp(appId, session.user.id);
    if (!app) return apiNotFound("App");
    await updateWorkflow(params.workflowId, appId, data);
    return apiOk({ updated: true });
  } catch (err) {
    console.error("[PUT workflow]", err);
    return apiServerError();
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return apiUnauthorized();
    const appId = new URL(req.url).searchParams.get("appId");
    if (!appId) return apiError("?appId= required", 400);
    const app = await getApp(appId, session.user.id);
    if (!app) return apiNotFound("App");
    await deleteWorkflow(params.workflowId, appId);
    return apiOk({ deleted: true });
  } catch (err) {
    console.error("[DELETE workflow]", err);
    return apiServerError();
  }
}
