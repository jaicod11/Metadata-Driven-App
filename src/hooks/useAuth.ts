// src/hooks/useAuth.ts
"use client";

import { useSession, signIn, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";

export function useAuth() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const login = (provider: "google" | "github" | "credentials", credentials?: { email: string; password: string }) => {
    if (provider === "credentials" && credentials) {
      return signIn("credentials", { ...credentials, callbackUrl: "/dashboard" });
    }
    return signIn(provider, { callbackUrl: "/dashboard" });
  };

  const logout = () => signOut({ callbackUrl: "/login" });

  return {
    user: session?.user ?? null,
    isLoading: status === "loading",
    isAuthenticated: status === "authenticated",
    login,
    logout,
  };
}
