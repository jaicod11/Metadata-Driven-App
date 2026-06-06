// src/hooks/useRuntimeData.ts
"use client";

import useSWR, { mutate as globalMutate } from "swr";
import { PaginatedResponse } from "@/types/api.types";

interface Options {
  page?: number;
  limit?: number;
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
  const { page = 1, limit = 20 } = options;

  const key =
    appId && entity
      ? `/api/runtime/${appId}/${entity}?page=${page}&limit=${limit}`
      : null;

  const { data, error, isLoading, mutate } = useSWR(key, fetcher, {
    revalidateOnFocus: false,
    keepPreviousData: true,
  });

  return { data: data ?? null, isLoading, error: error ?? null, mutate };
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
