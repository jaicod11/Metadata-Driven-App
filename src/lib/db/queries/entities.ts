import { prisma } from "@/lib/db/prisma";

export interface ListOptions {
  page?: number;
  limit?: number;
  orderBy?: "asc" | "desc";
}

export async function listEntityRecords(
  appId: string,
  entity: string,
  options: ListOptions = {}
) {
  const page = Math.max(1, options.page ?? 1);
  const limit = Math.min(options.limit ?? 20, 100);
  const skip = (page - 1) * limit;

  const [rows, total] = await Promise.all([
    prisma.appData.findMany({
      where: { appId, entity },
      orderBy: { createdAt: options.orderBy === "asc" ? "asc" : "desc" },
      skip,
      take: limit,
    }),
    prisma.appData.count({ where: { appId, entity } }),
  ]);

  const records = rows.map((r) => ({
    id: r.id,
    ...(r.data as Record<string, unknown>),
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }));

  return {
    records,
    meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

export async function getEntityRecord(
  appId: string,
  entity: string,
  id: string
) {
  const row = await prisma.appData.findFirst({
    where: { id, appId, entity },
  });
  if (!row) return null;
  return {
    id: row.id,
    ...(row.data as Record<string, unknown>),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function createEntityRecord(
  appId: string,
  entity: string,
  data: Record<string, unknown>
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row = await prisma.appData.create({
    data: { appId, entity, data: data as any },
  });
  return {
    id: row.id,
    ...(row.data as Record<string, unknown>),
    createdAt: row.createdAt,
  };
}

export async function updateEntityRecord(
  appId: string,
  entity: string,
  id: string,
  patch: Record<string, unknown>
) {
  const existing = await prisma.appData.findFirst({
    where: { id, appId, entity },
  });
  if (!existing) return null;
  const merged = { ...(existing.data as Record<string, unknown>), ...patch };
  const updated = await prisma.appData.update({
    where: { id },
    data: { data: merged as any },
  });
  return {
    id: updated.id,
    ...(updated.data as Record<string, unknown>),
    updatedAt: updated.updatedAt,
  };
}

export async function deleteEntityRecord(
  appId: string,
  entity: string,
  id: string
): Promise<boolean> {
  const existing = await prisma.appData.findFirst({
    where: { id, appId, entity },
  });
  if (!existing) return false;
  await prisma.appData.delete({ where: { id } });
  return true;
}

export async function bulkCreateEntityRecords(
  appId: string,
  entity: string,
  rows: Record<string, unknown>[]
) {
  return prisma.appData.createMany({
    data: rows.map((data) => ({ appId, entity, data: data as any })),
  });
}