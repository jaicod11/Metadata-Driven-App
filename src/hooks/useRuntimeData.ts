// src/hooks/useRuntimeData.ts
"use client";

import useSWR, { mutate as globalMutate } from "swr";
import { PaginatedResponse } from "@/types/api.types";

interface Options {
  page?: number;
  limit?: number;
  /** Only records whose `filterField` equals this — how hasMany finds children. */
  filterField?: string;
  filterValue?: string;
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
  const { page = 1, limit = 20, filterField, filterValue } = options;

  // A filter with no value would silently list everything — fetch nothing instead.
  const filtered = Boolean(filterField);
  const filterReady = !filtered || (filterValue !== undefined && filterValue !== "");

  const key =
    appId && entity && filterReady
      ? `/api/runtime/${appId}/${entity}?page=${page}&limit=${limit}` +
        (filtered
          ? `&filterField=${encodeURIComponent(filterField!)}` +
            `&filterValue=${encodeURIComponent(filterValue!)}`
          : "")
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

/** Imperatively revalidate entity data from outside a component */
export function revalidateEntity(appId: string, entity: string) {
  globalMutate(
    (key: string) =>
      typeof key === "string" && key.startsWith(`/api/runtime/${appId}/${entity}`),
    undefined,
    { revalidate: true }
  );
}
