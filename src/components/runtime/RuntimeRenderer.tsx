// src/components/runtime/RuntimeRenderer.tsx
"use client";

import { AppConfig, EntityConfig, PageConfig } from "@/types/config.types";
import { getComponent } from "./ComponentRegistry";
import { ErrorBoundary } from "./ErrorBoundary";
import {
  ActiveRole,
  FULL_ACCESS_ROLE,
  canSeePage,
} from "@/lib/runtime/permissions";

interface RuntimeRendererProps {
  config: AppConfig;
  /** URL segments after /runtime/[appId]/ — e.g. ["contacts"] or ["contacts","new"] */
  slug: string[];
  appId: string;
  /** Resolved server-side; defaults to full access for callers without roles. */
  role?: ActiveRole;
}

export function RuntimeRenderer({
  config,
  slug,
  appId,
  role = FULL_ACCESS_ROLE,
}: RuntimeRendererProps) {
  // Build the current path from the slug
  const path = "/" + (slug?.join("/") ?? "");

  // ── Page resolution ────────────────────────────────────────────────────────
  const page = resolvePage(config.pages, path);

  if (!page) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-gray-500">
        <p className="text-4xl mb-3">404</p>
        <p className="text-lg font-medium">Page not configured</p>
        <p className="text-sm mt-1 text-gray-400">
          No page in this app matches the path <code className="font-mono bg-gray-100 px-1 rounded">{path}</code>
        </p>
        <p className="text-xs mt-3 text-gray-400">
          Add a page with this path to the app's config to render something here.
        </p>
      </div>
    );
  }

  // ── Entity resolution ──────────────────────────────────────────────────────
  const entity: EntityConfig | undefined = page.entity
    ? config.entities.find((e) => e.name === page.entity)
    : undefined;

  // Warn when an entity is referenced but missing — don't crash
  if (page.entity && !entity) {
    console.warn(
      `[RuntimeRenderer] Page "${path}" references entity "${page.entity}" ` +
        `but it's not defined in the config. Rendering without entity context.`
    );
  }

  // ── Permission gate ────────────────────────────────────────────────────────
  // Hiding the nav link is not enough: a typed URL lands here too. The API
  // refuses the data either way.
  if (!canSeePage(config, page, role)) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] text-center">
        <p className="text-3xl mb-3">🔒</p>
        <p className="text-lg font-medium text-gray-700">Not available to you</p>
        <p className="text-sm mt-1 text-gray-500">
          Your role{role.name ? ` ("${role.label ?? role.name}")` : ""} does not
          have access to this page.
        </p>
      </div>
    );
  }

  // ── Component resolution ───────────────────────────────────────────────────
  const Component = getComponent(page.layout);

  // Props passed to every rendered component
  const componentProps = {
    page,
    entity,
    appId,
    config,
    slug,
    // Trailing segment beyond the page's own path — the record a detail page shows.
    recordId: resolveRecordId(page, path),
    role,
  };

  return (
    <ErrorBoundary componentType={page.layout}>
      <div className="w-full">
        {page.title && (
          <div className="mb-6">
            <h1 className="text-2xl font-semibold text-gray-900">{page.title}</h1>
          </div>
        )}

        <Component {...componentProps} />
      </div>
    </ErrorBoundary>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * The record id a page was opened with: whatever follows the page's own path.
 * A detail page at "/employees/view" is reached as "/employees/view/<id>".
 */
function resolveRecordId(page: PageConfig, path: string): string | undefined {
  const base = page.path.replace(/\/$/, "");
  if (!base || !path.startsWith(base + "/")) return undefined;

  const rest = path.slice(base.length + 1).split("/").filter(Boolean);
  return rest.length > 0 ? rest[rest.length - 1] : undefined;
}

/**
 * Find the best-matching PageConfig for the given path.
 * 1. Exact match first
 * 2. Prefix match (for nested routes)
 * Returns undefined if nothing matches — caller renders 404.
 */
function resolvePage(
  pages: PageConfig[],
  path: string
): PageConfig | undefined {
  if (!pages || pages.length === 0) return undefined;

  // Exact match
  const exact = pages.find((p) => p.path === path);
  if (exact) return exact;

  // Normalise trailing slashes and try again
  const normalised = path.replace(/\/$/, "") || "/";
  const normExact = pages.find((p) => p.path.replace(/\/$/, "") === normalised);
  if (normExact) return normExact;

  // Prefix match — the most specific (longest) prefix wins
  const prefixMatches = pages
    .filter((p) => path.startsWith(p.path + "/"))
    .sort((a, b) => b.path.length - a.path.length);

  return prefixMatches[0];
}
