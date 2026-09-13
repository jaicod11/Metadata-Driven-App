// src/components/runtime/audit/AuditLogView.tsx
"use client";

import { useState } from "react";
import { AppConfig, EntityConfig, PageConfig } from "@/types/config.types";
import { AuditEntry, useAuditLog } from "@/hooks/useRuntimeData";
import { ErrorBoundary } from "../ErrorBoundary";
import { ActiveRole, FULL_ACCESS_ROLE, can } from "@/lib/runtime/permissions";
import { isFieldChange } from "@/lib/runtime/audit";

interface Props {
  page: PageConfig;
  entity?: EntityConfig;
  appId: string;
  config: AppConfig;
  role?: ActiveRole;
}

const PAGE_SIZE = 20;

/**
 * Read-only history for one entity, newest first.
 *
 * Reached as a page layout:
 *   { "path": "/audit", "layout": "auditLog", "entity": "employee" }
 *
 * Gated by the "auditLog" entity permission — the same can() check the API
 * applies, so a role without it sees nothing here and gets a 403 there.
 */
export function AuditLogView({
  entity,
  appId,
  role = FULL_ACCESS_ROLE,
}: Props) {
  const [currentPage, setCurrentPage] = useState(1);
  const mayView = can(entity, role, "auditLog");

  const { data, isLoading, error } = useAuditLog(
    // Don't ask for history this role can't see — the API would 403.
    mayView ? appId : undefined,
    entity?.name,
    { page: currentPage, limit: PAGE_SIZE }
  );

  if (!entity) {
    return (
      <div className="p-4 rounded-lg border border-dashed border-amber-300 bg-amber-50">
        <p className="text-sm text-amber-700">
          No entity configured for this audit log. Add an{" "}
          <code className="font-mono text-xs bg-amber-100 px-1 rounded">entity</code>{" "}
          key to this page in your config.
        </p>
      </div>
    );
  }

  if (!mayView) {
    return (
      <div className="p-4 rounded-lg border border-dashed border-gray-300 bg-gray-50">
        <p className="text-sm text-gray-600">
          Your role{role.name ? ` ("${role.label ?? role.name}")` : ""} cannot
          view the audit log for {entity.label ?? entity.name}.
        </p>
      </div>
    );
  }

  if (isLoading && !data) {
    return <div className="h-48 rounded-xl bg-gray-100 animate-pulse" />;
  }

  if (error) {
    return (
      <div className="p-4 rounded-lg border border-red-200 bg-red-50">
        <p className="text-sm font-medium text-red-700">
          Failed to load the audit log
        </p>
        <p className="text-xs text-red-500 mt-1">{error.message}</p>
      </div>
    );
  }

  const entries = data?.entries ?? [];
  const meta = data?.meta;

  return (
    <ErrorBoundary componentType="auditLog">
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3 text-xs text-gray-500">
          <span>
            Changes to {(entity.label ?? entity.name).toLowerCase()} records,
            newest first.
          </span>
          {meta && (
            <span>
              {meta.total} {meta.total === 1 ? "entry" : "entries"}
            </span>
          )}
        </div>

        <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                {["When", "Action", "By", "Record", "Changes"].map((label) => (
                  <th
                    key={label}
                    className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap"
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {entries.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-gray-400">
                    <p className="text-sm">No changes recorded yet.</p>
                    <p className="text-xs mt-1">
                      Entries appear here as records are created, edited and
                      deleted.
                    </p>
                  </td>
                </tr>
              ) : (
                entries.map((entry) => (
                  <tr key={entry.id} className="align-top hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                      {formatTimestamp(entry.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <ActionBadge action={entry.action} />
                    </td>
                    <td className="px-4 py-3 text-gray-700 max-w-[200px] truncate">
                      {entry.userEmail ?? entry.userId}
                    </td>
                    <td
                      className="px-4 py-3 text-gray-400 font-mono text-xs"
                      title={entry.recordId}
                    >
                      #{entry.recordId.slice(-6)}
                    </td>
                    <td className="px-4 py-3">
                      <DiffCell entry={entry} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {meta && meta.totalPages > 1 && (
          <div className="flex items-center justify-between text-sm text-gray-600">
            <span>
              {(meta.page - 1) * meta.limit + 1}–
              {Math.min(meta.page * meta.limit, meta.total)} of {meta.total}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1.5 border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50 transition-colors font-medium"
              >
                ← Prev
              </button>
              <span className="px-3 py-1.5 font-medium">
                {meta.page} / {meta.totalPages}
              </span>
              <button
                onClick={() =>
                  setCurrentPage((p) => Math.min(meta.totalPages, p + 1))
                }
                disabled={currentPage === meta.totalPages}
                className="px-3 py-1.5 border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-gray-50 transition-colors font-medium"
              >
                Next →
              </button>
            </div>
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ActionBadge({ action }: { action: AuditEntry["action"] }) {
  const styles: Record<string, string> = {
    create: "bg-green-50 text-green-700 border-green-200",
    update: "bg-blue-50 text-blue-700 border-blue-200",
    delete: "bg-red-50 text-red-700 border-red-200",
  };

  return (
    <span
      className={`inline-block px-2 py-0.5 rounded-full border text-xs font-medium ${
        styles[action] ?? "bg-gray-50 text-gray-600 border-gray-200"
      }`}
    >
      {action}
    </span>
  );
}

/**
 * An update lists what moved; a create or delete lists the record as it stood.
 * Either way the entry only holds fields this reader may see, so an empty cell
 * means nothing visible changed.
 */
function DiffCell({ entry }: { entry: AuditEntry }) {
  const fields = Object.entries(entry.diff?.fields ?? {});

  if (fields.length === 0) {
    return <span className="text-xs text-gray-400">—</span>;
  }

  return (
    <ul className="space-y-0.5">
      {fields.map(([name, value]) => (
        <li key={name} className="text-xs">
          <span className="font-medium text-gray-600">{name}</span>{" "}
          {isFieldChange(value) ? (
            <>
              <span className="text-gray-400 line-through">
                {formatValue(value.from)}
              </span>{" "}
              <span className="text-gray-400">→</span>{" "}
              <span className="text-gray-800">{formatValue(value.to)}</span>
            </>
          ) : (
            <span className="text-gray-800">{formatValue(value)}</span>
          )}
        </li>
      ))}
    </ul>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatTimestamp(value: string): string {
  const parsed = Date.parse(value);
  if (isNaN(parsed)) return String(value);
  return new Date(parsed).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "empty";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object") return JSON.stringify(value);
  const text = String(value);
  return text.length > 60 ? text.slice(0, 57) + "…" : text;
}
