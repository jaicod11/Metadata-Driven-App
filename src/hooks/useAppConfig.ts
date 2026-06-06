// src/hooks/useAppConfig.ts
"use client";

import useSWR from "swr";
import { AppConfig } from "@/types/config.types";

interface ConfigResult {
  raw: Record<string, unknown>;
  parsed: { valid: boolean; config: AppConfig | null; errors: any[]; warnings: any[] };
}

const fetcher = async (url: string): Promise<ConfigResult> => {
  const res = await fetch(url);
  const json = await res.json();
  if (!res.ok) throw new Error(json.error?.message ?? "Failed to fetch config");
  return json.data;
};

export function useAppConfig(appId: string | undefined) {
  const { data, error, isLoading, mutate } = useSWR(
    appId ? `/api/apps/${appId}/config` : null,
    fetcher,
    { revalidateOnFocus: false }
  );

  return {
    config: data?.parsed?.config ?? null,
    raw: data?.raw ?? null,
    parseResult: data?.parsed ?? null,
    isLoading,
    error: error ?? null,
    mutate,
  };
}
