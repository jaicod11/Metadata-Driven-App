// src/lib/workflow/engine.ts
//
// The workflow execution engine. Called by:
//   - API route (manual trigger / execute endpoint)
//   - Runtime CRUD hooks (onSubmit, onUpdate, onDelete triggers)
//
// Design: each step runs in sequence. If a step fails, execution stops
// and the status is set to "failed". Outputs from each step are passed
// to subsequent steps as previousOutputs.

import { prisma } from "@/lib/db/prisma";
import { executeAction, ActionContext } from "./actions";
import { logExecution, updateExecution } from "@/lib/db/queries/workflows";
import { WorkflowConfig } from "@/types/config.types";

export interface ExecuteWorkflowOptions {
  workflowId: string;
  appId: string;
  triggerData?: Record<string, unknown>;
}

export interface ExecutionResult {
  executionId: string;
  status: "success" | "failed";
  steps: StepResult[];
  error?: string;
}

export interface StepResult {
  stepIndex: number;
  type: string;
  success: boolean;
  output?: Record<string, unknown>;
  error?: string;
}

export async function executeWorkflow(
  options: ExecuteWorkflowOptions
): Promise<ExecutionResult> {
  const { workflowId, appId, triggerData = {} } = options;

  // ── Load workflow ──────────────────────────────────────────────────────────
  const workflow = await prisma.workflow.findFirst({
    where: { id: workflowId, appId, isActive: true },
  });

  if (!workflow) {
    throw new Error(`Workflow "${workflowId}" not found or inactive`);
  }

  // ── Create execution record ────────────────────────────────────────────────
  const execution = await logExecution(workflowId, "running", triggerData);
  const stepResults: StepResult[] = [];
  const previousOutputs: Record<string, unknown>[] = [];

  const steps = (workflow.steps as WorkflowConfig["steps"]) ?? [];

  // ── Execute steps in order ─────────────────────────────────────────────────
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const context: ActionContext = { triggerData, appId, previousOutputs };

    const result = await executeAction(step, context);
    stepResults.push({ stepIndex: i, type: step.type, ...result });

    if (result.output) previousOutputs.push(result.output);

    // Stop on first failure
    if (!result.success) {
      const errorMsg = `Step ${i} (${step.type}) failed: ${result.error}`;
      await updateExecution(execution.id, "failed", stepResults, errorMsg);
      return {
        executionId: execution.id,
        status: "failed",
        steps: stepResults,
        error: errorMsg,
      };
    }
  }

  // ── All steps passed ───────────────────────────────────────────────────────
  await updateExecution(execution.id, "success", stepResults);
  return { executionId: execution.id, status: "success", steps: stepResults };
}

/**
 * Fire-and-forget: run all workflows for a given trigger without blocking
 * the request that caused the trigger.
 */
export async function fireTriggers(
  appId: string,
  triggerType: "onSubmit" | "onUpdate" | "onDelete",
  entityName: string,
  data: Record<string, unknown>
): Promise<void> {
  try {
    const workflows = await prisma.workflow.findMany({
      where: { appId, isActive: true },
    });

    const matching = workflows.filter((wf) => {
      const trigger = wf.trigger as WorkflowConfig["trigger"];
      return trigger.type === triggerType && trigger.entity === entityName;
    });

    // Run matched workflows in parallel (errors are logged, not thrown)
    await Promise.allSettled(
      matching.map((wf) =>
        executeWorkflow({ workflowId: wf.id, appId, triggerData: data }).catch(
          (err) => console.error(`[workflow:fire] ${wf.id}`, err)
        )
      )
    );
  } catch (err) {
    console.error("[workflow:fireTriggers]", err);
  }
}
