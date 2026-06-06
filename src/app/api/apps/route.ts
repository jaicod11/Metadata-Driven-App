// src/app/api/apps/route.ts
import { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth/auth-options";
import { getUserApps, createApp } from "@/lib/db/queries/apps";
import { parseConfig } from "@/lib/runtime/schema-parser";
import {
  apiOk,
  apiError,
  apiUnauthorized,
  apiServerError,
} from "@/lib/utils/api-response";

const createAppSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  config: z.record(z.unknown()), // raw JSON — will be parsed by schema-parser
});

// GET /api/apps — list all apps for the logged-in user
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return apiUnauthorized();

    const apps = await getUserApps(session.user.id);
    return apiOk(apps);
  } catch (err) {
    console.error("[GET /api/apps]", err);
    return apiServerError();
  }
}

// POST /api/apps — create a new app
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return apiUnauthorized();

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return apiError("Request body must be valid JSON", 400);
    }

    const parsed = createAppSchema.safeParse(body);
    if (!parsed.success) {
      return apiError("Validation failed", 400, parsed.error.errors);
    }

    const { name, description, config: rawConfig } = parsed.data;

    // Validate the app config before saving
    const configResult = parseConfig(rawConfig);
    if (!configResult.valid) {
      return apiError("Invalid app config", 422, configResult.errors);
    }

    const app = await createApp(session.user.id, {
      name,
      description,
      config: configResult.config!,
    });

    return apiOk(app, 201);
  } catch (err) {
    console.error("[POST /api/apps]", err);
    return apiServerError();
  }
}
