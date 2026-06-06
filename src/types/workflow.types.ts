// src/types/workflow.types.ts

export type WorkflowStatus = "pending" | "running" | "success" | "failed";

/** A recorded workflow run stored in the database */
export interface WorkflowExecutionRecord {
  id: string;
  workflowId: string;
  status: WorkflowStatus;
  input?: Record<string, unknown>;
  output?: unknown;
  error?: string;
  startedAt: string;
  finishedAt?: string;
}

/** Summary returned when listing workflows from the API */
export interface WorkflowSummary {
  id: string;
  name: string;
  description?: string;
  trigger: {
    type: string;
    entity?: string;
    cron?: string;
  };
  steps: { type: string; name?: string; config: Record<string, unknown> }[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  _count: { executions: number };
}
