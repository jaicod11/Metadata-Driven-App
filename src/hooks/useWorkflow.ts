// src/hooks/useWorkflow.ts
"use client";

import useSWR from "swr";
import { useState } from "react";
import { WorkflowSummary } from "@/types/workflow.types";
import toast from "react-hot-toast";

const fetcher = async (url: string) => {
  const res = await fetch(url);
  const json = await res.json();
  if (!res.ok) throw new Error(json.error?.message ?? "Failed to fetch");
  return json.data;
};

export function useWorkflows(appId: string | undefined) {
  const { data, error, isLoading, mutate } = useSWR<WorkflowSummary[]>(
    appId ? `/api/workflows?appId=${appId}` : null,
    fetcher,
    { revalidateOnFocus: false }
  );

  return {
    workflows: data ?? [],
    isLoading,
    error: error ?? null,
    mutate,
  };
}

export function useWorkflowExecution(appId: string) {
  const [executing, setExecuting] = useState<string | null>(null);

  const execute = async (workflowId: string, triggerData?: Record<string, unknown>) => {
    setExecuting(workflowId);
    try {
      const res = await fetch(`/api/workflows/${workflowId}/execute?appId=${appId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(triggerData ?? {}),
      });
      const json = await res.json();

      if (res.ok) {
        toast.success(`Workflow ran: ${json.data.status}`);
        return json.data;
      } else {
        toast.error(json.error?.message ?? "Execution failed");
        return null;
      }
    } finally {
      setExecuting(null);
    }
  };

  return { execute, executing };
}
