// src/app/runtime/[appId]/[[...slug]]/page.tsx
//
// Server Component. Fetches the app + config server-side, then renders
// the RuntimeRenderer client component with the resolved config.

import { notFound, redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth/session";
import { getApp } from "@/lib/db/queries/apps";
import { parseConfig } from "@/lib/runtime/schema-parser";
import { RuntimeRenderer } from "@/components/runtime/RuntimeRenderer";

interface PageProps {
  params: { appId: string; slug?: string[] };
}

export default async function RuntimePage({ params }: PageProps) {
  const user = await requireAuth();

  const app = await getApp(params.appId, user.id);
  if (!app) notFound();

  const parsed = parseConfig(app.config);

  // If the config is entirely broken, show a clear error rather than the renderer
  if (!parsed.valid || !parsed.config) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white rounded-xl border border-red-200 shadow p-6">
          <h1 className="text-lg font-semibold text-red-700 mb-2">
            Invalid App Configuration
          </h1>
          <p className="text-sm text-gray-600 mb-4">
            This app's config has errors that prevent it from rendering. Fix them
            in the config editor.
          </p>
          <ul className="space-y-1 mb-4">
            {parsed.errors.map((e, i) => (
              <li key={i} className="text-xs text-red-600 font-mono bg-red-50 px-2 py-1 rounded">
                <span className="font-semibold">{e.path}:</span> {e.message}
              </li>
            ))}
          </ul>
          <a
            href={`/dashboard/apps/${params.appId}/config`}
            className="inline-block px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            Open Config Editor →
          </a>
        </div>
      </div>
    );
  }

  const slug = params.slug ?? [];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top bar */}
      <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <a
            href="/dashboard"
            className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            ← Dashboard
          </a>
          <span className="text-gray-300">/</span>
          <span className="text-sm font-semibold text-gray-800">{app.name}</span>
        </div>

        {/* Warnings badge */}
        {parsed.warnings.length > 0 && (
          <details className="relative">
            <summary className="cursor-pointer text-xs text-amber-600 font-medium px-2 py-1 bg-amber-50 rounded-full border border-amber-200 list-none">
              {parsed.warnings.length} config warning{parsed.warnings.length > 1 ? "s" : ""}
            </summary>
            <div className="absolute right-0 top-8 z-50 w-72 bg-white rounded-lg border border-amber-200 shadow-lg p-3 space-y-1">
              {parsed.warnings.map((w, i) => (
                <p key={i} className="text-xs text-amber-700">
                  <span className="font-mono text-amber-500">{w.path}:</span> {w.message}
                </p>
              ))}
            </div>
          </details>
        )}
      </header>

      {/* App nav — generated from config.pages */}
      {parsed.config.pages.length > 1 && (
        <nav className="bg-white border-b border-gray-100 px-6 flex gap-1">
          {parsed.config.pages.map((page) => {
            const href = `/runtime/${params.appId}${page.path}`;
            const currentPath = "/" + slug.join("/");
            const isActive = currentPath === page.path || currentPath.startsWith(page.path + "/");
            return (
              <a
                key={page.path}
                href={href}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                  isActive
                    ? "border-blue-600 text-blue-600"
                    : "border-transparent text-gray-500 hover:text-gray-800"
                }`}
              >
                {page.title ?? page.path}
              </a>
            );
          })}
        </nav>
      )}

      {/* Main content */}
      <main className="max-w-6xl mx-auto px-6 py-8">
        <RuntimeRenderer
          config={parsed.config}
          slug={slug}
          appId={params.appId}
        />
      </main>
    </div>
  );
}

export async function generateMetadata({ params }: PageProps) {
  const user = await requireAuth().catch(() => null);
  if (!user) return {};
  const app = await getApp(params.appId, user.id);
  return { title: app?.name ?? "App" };
}
