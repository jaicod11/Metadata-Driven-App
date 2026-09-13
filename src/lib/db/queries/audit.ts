// src/lib/db/queries/audit.ts

import { prisma } from "@/lib/db/prisma";
import { AuditAction, AuditDiff } from "@/lib/runtime/audit";

export interface AuditEntryInput {
  appId: string;
  entity: string;
  recordId: string;
  action: AuditAction;
  userId: string;
  userEmail?: string | null;
  diff: AuditDiff;
}

/**
 * Record a mutation that has already committed.
 *
 * Deliberately swallows its own failure: the write it describes is already
 * durable, so throwing here would report a failure to the client for a change
 * that actually happened. The error is logged loudly instead.
 */
export async function recordAuditEntry(input: AuditEntryInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        appId: input.appId,
        entity: input.entity,
        recordId: input.recordId,
        action: input.action,
        userId: input.userId,
        userEmail: input.userEmail ?? null,
        // Prisma's InputJsonValue rejects Record<string, unknown> — same cast
        // the AppData writes use.
        diff: input.diff as any,
      },
    });
  } catch (err) {
    console.error(
      `[audit] failed to log ${input.action} of ${input.entity}/${input.recordId}`,
      err
    );
  }
}

export interface ListAuditOptions {
  page?: number;
  limit?: number;
}

export const MAX_AUDIT_PAGE_SIZE = 100;

/** Newest first, for one entity of one app. */
export async function listAuditEntries(
  appId: string,
  entity: string,
  options: ListAuditOptions = {}
) {
  const page = Math.max(1, options.page ?? 1);
  const limit = Math.min(Math.max(1, options.limit ?? 20), MAX_AUDIT_PAGE_SIZE);
  const where = { appId, entity };

  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.auditLog.count({ where }),
  ]);

  return {
    entries: rows,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    },
  };
}
