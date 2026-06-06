// src/lib/db/queries/apps.ts
import { prisma } from "@/lib/db/prisma";
import { AppConfig } from "@/types/config.types";

/** Get all apps belonging to a user */
export async function getUserApps(userId: string) {
  return prisma.app.findMany({
    where: { userId, isActive: true },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { data: true, workflows: true } },
    },
  });
}

/** Get a single app — verifies ownership */
export async function getApp(appId: string, userId: string) {
  return prisma.app.findFirst({
    where: { id: appId, userId },
  });
}

/** Get an app by slug — verifies ownership */
export async function getAppBySlug(slug: string, userId: string) {
  return prisma.app.findFirst({
    where: { slug, userId },
  });
}

/** Create a new app */
export async function createApp(
  userId: string,
  data: { name: string; description?: string; config: AppConfig }
) {
  const slug = generateSlug(data.name);
  return prisma.app.create({
    data: {
      userId,
      name: data.name,
      slug,
      description: data.description,
      config: data.config as any,
    },
  });
}

/** Update app config */
export async function updateAppConfig(
  appId: string,
  userId: string,
  config: AppConfig
) {
  return prisma.app.updateMany({
    where: { id: appId, userId },
    data: { config: config as any, updatedAt: new Date() },
  });
}

/** Soft-delete an app */
export async function deleteApp(appId: string, userId: string) {
  return prisma.app.updateMany({
    where: { id: appId, userId },
    data: { isActive: false },
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function generateSlug(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 40);
  // Append short random suffix to avoid collisions
  const suffix = Math.random().toString(36).slice(2, 7);
  return `${base}-${suffix}`;
}
