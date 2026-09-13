// src/app/api-docs/page.tsx
//
// /api-docs?appId=<id> — Swagger UI over the generated OpenAPI document.
// Without an appId it lists the apps this user owns, so the page is reachable
// without hand-writing a URL.

import { Metadata } from "next";
import Link from "next/link";
import { requireAuth } from "@/lib/auth/session";
import { getUserApps } from "@/lib/db/queries/apps";
import { SwaggerViewer } from "@/components/api-docs/SwaggerViewer";

export const metadata: Metadata = { title: "API Docs" };

interface PageProps {
  searchParams: { appId?: string };
}

export default async function ApiDocsPage({ searchParams }: PageProps) {
  // Middleware only covers /dashboard and /runtime, so this page checks for
  // itself — the document endpoint enforces ownership again on every request.
  const user = await requireAuth();
  const appId = searchParams.appId;

  if (!appId) {
    const apps = await getUserApps(user.id);

    return (
      <div className="min-h-screen bg-gray-50">
        <Header />
        <main className="max-w-3xl mx-auto px-6 py-10 space-y-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">API Reference</h1>
            <p className="text-sm text-gray-500 mt-1">
              Every app exposes a REST API generated from its config. Pick one to
              read its reference.
            </p>
          </div>

          {apps.length === 0 ? (
            <div className="p-4 rounded-xl border border-dashed border-gray-300 bg-white">
              <p className="text-sm text-gray-600">
                You have no apps yet.{" "}
                <Link href="/dashboard/apps/new" className="text-blue-600 hover:underline">
                  Create one
                </Link>{" "}
                and its API reference appears here.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white overflow-hidden">
              {apps.map((app) => (
                <li key={app.id}>
                  <Link
                    href={`/api-docs?appId=${app.id}`}
                    className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
                  >
                    <span>
                      <span className="text-sm font-medium text-gray-800">
                        {app.name}
                      </span>
                      {app.description && (
                        <span className="block text-xs text-gray-500">
                          {app.description}
                        </span>
                      )}
                    </span>
                    <span className="text-xs text-blue-600">View API →</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </main>
      </div>
    );
  }

  const specUrl = `/api/openapi.json?appId=${encodeURIComponent(appId)}`;

  return (
    <div className="min-h-screen bg-white">
      <Header specUrl={specUrl} />
      <SwaggerViewer specUrl={specUrl} />
    </div>
  );
}

function Header({ specUrl }: { specUrl?: string }) {
  return (
    <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <Link
          href="/dashboard"
          className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
        >
          ← Dashboard
        </Link>
        <span className="text-gray-300">/</span>
        <span className="text-sm font-semibold text-gray-800">API Docs</span>
      </div>

      {specUrl && (
        <a
          href={specUrl}
          className="text-xs text-blue-600 hover:text-blue-800 hover:underline font-mono"
        >
          openapi.json
        </a>
      )}
    </header>
  );
}
