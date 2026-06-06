"use client";
// src/components/layout/Header.tsx

import { signOut } from "next-auth/react";
import { usePathname } from "next/navigation";

const PAGE_TITLES: Record<string, string> = {
  "/dashboard":          "Overview",
  "/dashboard/apps":     "My Apps",
  "/dashboard/apps/new": "New App",
  "/dashboard/settings": "Settings",
};

export function Header() {
  const path = usePathname();
  const title = PAGE_TITLES[path] ?? "Dashboard";

  return (
    <header className="h-14 shrink-0 border-b border-gray-200 bg-white flex items-center justify-between px-6">
      <h2 className="font-semibold text-gray-800 text-sm">{title}</h2>
      <button
        onClick={() => signOut({ callbackUrl: "/login" })}
        className="text-xs text-gray-500 hover:text-gray-800 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors font-medium"
      >
        Sign out
      </button>
    </header>
  );
}
