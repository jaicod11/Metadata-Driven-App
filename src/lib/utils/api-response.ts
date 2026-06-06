// src/lib/utils/api-response.ts
import { NextResponse } from "next/server";

/** Successful response: { success: true, data: T } */
export function apiOk<T>(data: T, status = 200) {
  return NextResponse.json({ success: true, data }, { status });
}

/** Error response: { success: false, error: { message, details? } } */
export function apiError(message: string, status = 400, details?: unknown) {
  return NextResponse.json(
    { success: false, error: { message, details: details ?? null } },
    { status }
  );
}

// Aliases for common statuses
export const apiUnauthorized = () => apiError("Unauthorized", 401);
export const apiNotFound = (entity = "Resource") =>
  apiError(`${entity} not found`, 404);
export const apiServerError = (msg = "Internal server error") =>
  apiError(msg, 500);
