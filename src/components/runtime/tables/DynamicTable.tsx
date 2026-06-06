// src/components/runtime/tables/DynamicTable.tsx
"use client";

import { useState } from "react";
import { AppConfig, EntityConfig, FieldType, PageConfig } from "@/types/config.types";
import { useRuntimeData } from "@/hooks/useRuntimeData";
import { TableActions } from "./TableActions";
import { ErrorBoundary } from "../ErrorBoundary";

interface Props {
  page: PageConfig;
  entity?: EntityConfig;
  appId: string;
  config: AppConfig;
}

export function DynamicTable({ page, entity, appId }: Props) {
  const [currentPage, setCurrentPage] = useState(1);
  const { data, isLoading, error, mutate } = useRuntimeData(
    appId,
    entity?.name,
    { page: currentPage, limit: 20 }
  );

  // ── Guard ──────────────────────────────────────────────────────────────────
  if (!entity) {
    return (
      <div className="p-4 rounded-lg border border-dashed border-amber-300 bg-amber-50">
        <p className="text-sm text-amber-700">
          No entity configured for this table. Add an <code className="font-mono text-xs bg-amber-100 px-1 rounded">entity</code> key to this page in your config.
        </p>
      </div>
    );
  }

  // ── Loading ────────────────────────────────────────────────────────────────
  if (isLoading && !data) {
    return (
      <div className="space-y-3">
        <TableSkeleton cols={entity.fields.length} />
      </div>
    );
  }

  // ── Error ──────────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="p-4 rounded-lg border border-red-200 bg-red-50">
        <p className="text-sm font-medium text-red-700">Failed to load data</p>
        <p className="text-xs text-red-500 mt-1">{error.message}</p>
        <button
          onClick={() => mutate()}
          className="mt-2 text-xs text-red-600 underline"
        >
          Try again
        </button>
      </div>
    );
  }

  const records: Record<string, unknown>[] = data?.records ?? [];
  const meta = data?.meta;
  const visibleFields = entity.fields.filter((f) => !f.hidden);

  const handleDelete = async (id: string) => {
    await fetch(`/api/runtime/${appId}/${entity.name}?id=${id}`, {
      method: "DELETE",
    });
    mutate();
  };

  return (
    <ErrorBoundary componentType="table">
      <div className="space-y-4">
        {/* Table */}
        <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                {visibleFields.map((f) => (
                  <th
                    key={f.name}
                    className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap"
                  >
                    {f.label ?? f.name}
                  </th>
                ))}
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {records.length === 0 ? (
                <tr>
                  <td
                    colSpan={visibleFields.length + 1}
                    className="px-4 py-12 text-center text-gray-400"
                  >
                    <p className="text-sm">No records yet.</p>
                    <p className="text-xs mt-1">
                      Use the form page for this entity to add some.
                    </p>
                  </td>
                </tr>
              ) : (
                records.map((record) => (
                  <tr
                    key={String(record.id)}
                    className="hover:bg-gray-50 transition-colors"
                  >
                    {visibleFields.map((f) => (
                      <td
                        key={f.name}
                        className="px-4 py-3 text-gray-700 max-w-[240px] truncate"
                        title={formatCellValue(record[f.name], f.type)}
                      >
                        {formatCellValue(record[f.name], f.type)}
                      </td>
                    ))}
                    <td className="px-4 py-3">
                      <TableActions
                        record={record}
                        appId={appId}
                        entity={entity.name}
                        onDelete={handleDelete}
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {meta && meta.totalPages > 1 && (
          <div className="flex items-center justify-between text-sm text-gray-600">
            <span>
              {((meta.page - 1) * meta.limit) + 1}–
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

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatCellValue(value: unknown, type: FieldType | string): string {
  if (value === null || value === undefined) return "—";
  if (type === "boolean") return value ? "✓ Yes" : "✗ No";
  if (type === "date") {
    try {
      return new Date(String(value)).toLocaleDateString(undefined, {
        year: "numeric", month: "short", day: "numeric",
      });
    } catch {
      return String(value);
    }
  }
  const str = String(value);
  return str.length > 60 ? str.slice(0, 57) + "…" : str;
}

function TableSkeleton({ cols }: { cols: number }) {
  return (
    <div className="rounded-xl border border-gray-200 overflow-hidden animate-pulse">
      <div className="bg-gray-50 h-10" />
      {[...Array(5)].map((_, i) => (
        <div key={i} className="flex gap-4 px-4 py-3 border-t border-gray-100">
          {[...Array(cols + 1)].map((_, j) => (
            <div key={j} className="h-4 bg-gray-200 rounded flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}
