// src/app/api/workflows/route.ts
import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth/auth-options";
import { getApp } from "@/lib/db/queries/apps";
import { getWorkflows, createWorkflow } from "@/lib/db/queries/workflows";
import { apiOk, apiError, apiUnauthorized, apiNotFound, apiServerError } from "@/lib/utils/api-response";

const createSchema = z.object({
  appId: z.string().min(1),
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  trigger: z.object({
    type: z.enum(["onSubmit", "onUpdate", "onDelete", "schedule", "manual"]),
    entity: z.string().optional(),
    cron: z.string().optional(),
  }),
  steps: z.array(z.object({
    type: z.enum(["sendEmail", "callWebhook", "transform", "notify", "condition"]),
    name: z.string().optional(),
    config: z.record(z.unknown()),
  })).default([]),
});

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return apiUnauthorized();

    const appId = new URL(req.url).searchParams.get("appId");
    if (!appId) return apiError("?appId= is required", 400);

    const app = await getApp(appId, session.user.id);
    if (!app) return apiNotFound("App");

    const workflows = await getWorkflows(appId);
    return apiOk(workflows);
  } catch (err) {
    console.error("[GET /api/workflows]", err);
    return apiServerError();
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return apiUnauthorized();

    const body = await req.json().catch(() => ({}));
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) return apiError("Validation failed", 400, parsed.error.errors);

    const { appId, ...data } = parsed.data;
    const app = await getApp(appId, session.user.id);
    if (!app) return apiNotFound("App");

    const workflow = await createWorkflow(appId, data);
    return apiOk(workflow, 201);
  } catch (err) {
    console.error("[POST /api/workflows]", err);
    return apiServerError();
  }
}
