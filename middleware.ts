// middleware.ts  (project root — not inside src/)
import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

export default withAuth(
  function middleware() {
    return NextResponse.next();
  },
  {
    callbacks: {
      // A request is "authorized" when a valid JWT exists
      authorized: ({ token }) => !!token,
    },
  }
);

export const config = {
  // Protect every route under /dashboard and /runtime
  matcher: [
    "/(dashboard)/:path*",
    "/dashboard/:path*",
    "/runtime/:path*",
  ],
};
