// src/lib/auth/session.ts
import { getServerSession } from "next-auth";
import { authOptions } from "./auth-options";
import { redirect } from "next/navigation";

/** Returns the current user or null — safe to call from Server Components */
export async function getCurrentUser() {
  const session = await getServerSession(authOptions);
  return session?.user ?? null;
}

/**
 * Asserts the user is authenticated.
 * Redirects to /login if not — use in protected Server Components.
 */
export async function requireAuth() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}
