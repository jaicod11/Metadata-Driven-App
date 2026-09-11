// src/components/runtime/tables/DynamicTable.tsx
"use client";

import { useEffect, useState } from "react";
import {
  AppConfig,
  EntityConfig,
  FieldConfig,
  FieldType,
  PageConfig,
} from "@/types/config.types";
import { useRuntimeData } from "@/hooks/useRuntimeData";
import { TableActions } from "./TableActions";
import { ErrorBoundary } from "../ErrorBoundary";
import { RelationValue } from "../relations/RelationValue";
import {
  detailHref,
  findDetailPage,
  isBelongsTo,
  isHasMany,
} from "@/lib/runtime/relations";
import {
  ActiveRole,
  FULL_ACCESS_ROLE,
  can,
  visibleFields,
} from "@/lib/runtime/permissions";
import { computeFieldValue, isComputed } from "@/lib/runtime/computed";

const PAGE_SIZE = 20;

interface Props {
  page: PageConfig;
  entity?: EntityConfig;
  appId: string;
  config: AppConfig;
  role?: ActiveRole;
}

export function DynamicTable({
  page,
  entity,
  appId,
  config,
  role = FULL_ACCESS_ROLE,
}: Props) {
  const [currentPage, setCurrentPage] = useState(1);
  const [sort, setSort] = useState<{ field: string; dir: "asc" | "desc" } | null>(
    null
  );
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const mayRead = can(entity, role, "read");

  // Typing shouldn't fire a request per keystroke; the committed term is what
  // the SWR key is built from.
  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // A new query means a new first page.
  useEffect(() => {
    setCurrentPage(1);
  }, [search, sort?.field, sort?.dir]);

  // Filtering, sorting, searching and paging all happen server-side: this is one
  // request for the whole view, re-keyed when the query changes.
  const { data, isLoading, error, mutate } = useRuntimeData(
    // Don't even ask for records this role cannot read — the API would 403.
    mayRead ? appId : undefined,
    entity?.name,
    {
      page: currentPage,
      limit: PAGE_SIZE,
      sort: sort?.field,
      dir: sort?.dir,
      search: search || undefined,
    }
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

  if (!mayRead) {
    return (
      <div className="p-4 rounded-lg border border-dashed border-gray-300 bg-gray-50">
        <p className="text-sm text-gray-600">
          Your role{role.name ? ` ("${role.label ?? role.name}")` : ""} cannot
          view {entity.label ?? entity.name} records.
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
  // hasMany holds no value on this record — it lives on the detail page. Fields
  // this role cannot see, and relations whose target it cannot read, are dropped
  // here so no cell ever tries to resolve them.
  const columns = visibleFields(config, entity, role).filter((f) => !isHasMany(f));
  const detailPage = findDetailPage(config, entity.name);
  const mayDelete = can(entity, role, "delete");

  /** First click sorts ascending, second flips, third clears. */
  const toggleSort = (field: string) => {
    setSort((current) => {
      if (current?.field !== field) return { field, dir: "asc" };
      if (current.dir === "asc") return { field, dir: "desc" };
      return null;
    });
  };

  const handleDelete = async (id: string) => {
    await fetch(`/api/runtime/${appId}/${entity.name}?id=${id}`, {
      method: "DELETE",
    });
    mutate();
  };

  return (
    <ErrorBoundary componentType="table">
      <div className="space-y-4">
        {/* Toolbar */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="relative">
            <input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder={`Search ${(entity.label ?? entity.name).toLowerCase()}…`}
              className="w-64 max-w-full pl-8 pr-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
            />
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm">
              ⌕
            </span>
          </div>

          <div className="flex items-center gap-3 text-xs text-gray-500">
            {isLoading && <span>Loading…</span>}
            {meta && (
              <span>
                {meta.total} {meta.total === 1 ? "record" : "records"}
              </span>
            )}
            {(sort || search) && (
              <button
                type="button"
                onClick={() => {
                  setSort(null);
                  setSearchInput("");
                }}
                className="underline hover:text-gray-700"
              >
                Reset
              </button>
            )}
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                {columns.map((f) => {
                  // Computed values are derived at read time and relations hold
                  // an opaque id, so neither can be ordered by in the database.
                  const sortable = !isComputed(f) && !isBelongsTo(f);
                  const active = sort?.field === f.name;

                  return (
                    <th
                      key={f.name}
                      className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap"
                    >
                      {sortable ? (
                        <button
                          type="button"
                          onClick={() => toggleSort(f.name)}
                          className={`flex items-center gap-1 uppercase tracking-wider transition-colors ${
                            active ? "text-blue-600" : "hover:text-gray-700"
                          }`}
                          aria-label={`Sort by ${f.label ?? f.name}`}
                        >
                          {f.label ?? f.name}
                          <span className={active ? "" : "text-gray-300"}>
                            {active ? (sort?.dir === "asc" ? "↑" : "↓") : "↕"}
                          </span>
                        </button>
                      ) : (
                        (f.label ?? f.name)
                      )}
                    </th>
                  );
                })}
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {records.length === 0 ? (
                <tr>
                  <td
                    colSpan={columns.length + 1}
                    className="px-4 py-12 text-center text-gray-400"
                  >
                    {search ? (
                      <>
                        <p className="text-sm">
                          No records match &quot;{search}&quot;.
                        </p>
                        <p className="text-xs mt-1">
                          Try a different search term.
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="text-sm">No records yet.</p>
                        <p className="text-xs mt-1">
                          Use the form page for this entity to add some.
                        </p>
                      </>
                    )}
                  </td>
                </tr>
              ) : (
                records.map((record) => (
                  <tr
                    key={String(record.id)}
                    className="hover:bg-gray-50 transition-colors"
                  >
                    {columns.map((f) => (
                      <td
                        key={f.name}
                        className="px-4 py-3 text-gray-700 max-w-[240px] truncate"
                        title={
                          isBelongsTo(f)
                            ? undefined
                            : formatCellValue(cellValue(f, record), f.type)
                        }
                      >
                        {isBelongsTo(f) ? (
                          <RelationValue
                            value={record[f.name]}
                            field={f}
                            appId={appId}
                            config={config}
                            role={role}
                          />
                        ) : (
                          formatCellValue(cellValue(f, record), f.type)
                        )}
                      </td>
                    ))}
                    <td className="px-4 py-3">
                      <TableActions
                        record={record}
                        appId={appId}
                        entity={entity.name}
                        onDelete={mayDelete ? handleDelete : undefined}
                        detailHref={
                          detailPage
                            ? detailHref(appId, detailPage, String(record.id))
                            : undefined
                        }
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

/** Computed fields are derived here, not read from the stored row. */
function cellValue(field: FieldConfig, record: Record<string, unknown>): unknown {
  return isComputed(field) ? computeFieldValue(field, record) : record[field.name];
}

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
