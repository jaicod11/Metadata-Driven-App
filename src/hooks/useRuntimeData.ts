// src/hooks/useRuntimeData.ts
"use client";

import useSWR, { mutate as globalMutate } from "swr";
import { PaginatedResponse, PaginationMeta } from "@/types/api.types";

interface Options {
  page?: number;
  limit?: number;
  /** Only records whose `filterField` equals this — how hasMany finds children. */
  filterField?: string;
  filterValue?: string;
  /** Exact-match filters, keyed by field name. */
  filters?: Record<string, string | undefined>;
  /** Field to order by — a stored field name, or createdAt / updatedAt. */
  sort?: string;
  dir?: "asc" | "desc";
  /** Text search across the fields the role may read. */
  search?: string;
}

interface UseRuntimeDataResult {
  data: PaginatedResponse<Record<string, unknown>> | null;
  isLoading: boolean;
  error: Error | null;
  mutate: () => void;
}

const fetcher = async (url: string) => {
  const res = await fetch(url);
  const json = await res.json();
  if (!res.ok) throw new Error(json.error?.message ?? "Failed to fetch");
  return json.data;
};

export function useRuntimeData(
  appId: string | undefined,
  entity: string | undefined,
  options: Options = {}
): UseRuntimeDataResult {
  const {
    page = 1,
    limit = 20,
    filterField,
    filterValue,
    filters,
    sort,
    dir = "desc",
    search,
  } = options;

  // A filter with no value would silently list everything — fetch nothing instead.
  const filtered = Boolean(filterField);
  const filterReady = !filtered || (filterValue !== undefined && filterValue !== "");

  // One key per entity + query: params are appended in a fixed order, so every
  // component showing the same view shares a single request and a single cache
  // entry. revalidateEntity() still matches them all on the path prefix.
  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("limit", String(limit));
  if (sort) {
    params.set("sort", sort);
    params.set("dir", dir);
  }
  if (search) params.set("q", search);
  for (const [field, value] of Object.entries(filters ?? {})) {
    if (value !== undefined && value !== "") params.set(`filter.${field}`, value);
  }
  if (filtered && filterReady) {
    params.set("filterField", filterField!);
    params.set("filterValue", filterValue!);
  }

  const key =
    appId && entity && filterReady
      ? `/api/runtime/${appId}/${entity}?${params.toString()}`
      : null;

  const { data, error, isLoading, mutate } = useSWR(key, fetcher, {
    revalidateOnFocus: false,
    keepPreviousData: true,
  });

  return { data: data ?? null, isLoading, error: error ?? null, mutate };
}

/**
 * A single record by id. Shares the `/api/runtime/:appId/:entity` key prefix, so
 * revalidateEntity() refreshes it along with every list view.
 */
export function useRuntimeRecord(
  appId: string | undefined,
  entity: string | undefined,
  id: string | undefined
) {
  const key =
    appId && entity && id ? `/api/runtime/${appId}/${entity}?id=${id}` : null;

  const { data, error, isLoading, mutate } = useSWR(key, fetcher, {
    revalidateOnFocus: false,
    keepPreviousData: true,
  });

  return {
    record: (data ?? null) as Record<string, unknown> | null,
    isLoading,
    error: (error ?? null) as Error | null,
    mutate,
  };
}

export interface AuditEntry {
  id: string;
  entity: string;
  recordId: string;
  action: "create" | "update" | "delete";
  userId: string;
  userEmail: string | null;
  createdAt: string;
  /** Already redacted to what this reader may see — see lib/runtime/audit.ts. */
  diff: { fields: Record<string, unknown> };
}

/**
 * Recent audit entries for one entity. Shares the
 * `/api/runtime/:appId/:entity` key prefix, so revalidateEntity() refreshes the
 * log along with the records after a write.
 */
export function useAuditLog(
  appId: string | undefined,
  entity: string | undefined,
  options: { page?: number; limit?: number } = {}
) {
  const { page = 1, limit = 20 } = options;

  const key =
    appId && entity
      ? `/api/runtime/${appId}/${entity}/audit?page=${page}&limit=${limit}`
      : null;

  const { data, error, isLoading, mutate } = useSWR(key, fetcher, {
    revalidateOnFocus: false,
    keepPreviousData: true,
  });

  return {
    data: (data ?? null) as {
      entries: AuditEntry[];
      meta: PaginationMeta;
    } | null,
    isLoading,
    error: (error ?? null) as Error | null,
    mutate,
  };
}

/** Imperatively revalidate entity data from outside a component */
export function revalidateEntity(appId: string, entity: string) {
  globalMutate(
    (key: string) =>
      typeof key === "string" && key.startsWith(`/api/runtime/${appId}/${entity}`),
    undefined,
    { revalidate: true }
  );
}
