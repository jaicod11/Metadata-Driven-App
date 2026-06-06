// src/lib/utils/error-handler.ts
import { NextResponse } from "next/server";
import { ZodError } from "zod";

/**
 * Wraps an async API route handler and catches all errors.
 * Maps ZodError → 400, generic Error → 500.
 */
export function withErrorHandler(
  handler: (...args: any[]) => Promise<NextResponse>
) {
  return async (...args: any[]): Promise<NextResponse> => {
    try {
      return await handler(...args);
    } catch (error) {
      if (error instanceof ZodError) {
        return NextResponse.json(
          {
            success: false,
            error: {
              message: "Validation failed",
              details: error.errors.map((e) => ({
                field: e.path.join("."),
                message: e.message,
              })),
            },
          },
          { status: 400 }
        );
      }

      console.error("[API Error]", error);
      return NextResponse.json(
        { success: false, error: { message: "Internal server error" } },
        { status: 500 }
      );
    }
  };
}
