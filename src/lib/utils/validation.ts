// src/lib/utils/validation.ts
// Shared Zod helpers used across multiple API routes

import { z } from "zod";

/** Parse page + limit from URL search params */
export const paginationSchema = z.object({
  page:  z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

/** Validate a CUID or UUID id param */
export const idSchema = z.object({
  id: z.string().min(1, "ID is required"),
});

/** Validate an appId + entity pair */
export const entityParamSchema = z.object({
  appId:  z.string().min(1),
  entity: z.string().min(1),
});

/** Validate a URL string */
export const urlSchema = z
  .string()
  .url("Must be a valid URL (include https://)");

/** Strip undefined values from an object (Prisma-safe) */
export function stripUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined)
  ) as Partial<T>;
}
