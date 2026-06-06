// src/lib/db/queries/workflows.ts
import { prisma } from "@/lib/db/prisma";
import { WorkflowConfig } from "@/types/config.types";

export async function getWorkflows(appId: string) {
  return prisma.workflow.findMany({
    where: { appId, isActive: true },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { executions: true } } },
  });
}

export async function getWorkflow(workflowId: string, appId: string) {
  return prisma.workflow.findFirst({ where: { id: workflowId, appId } });
}

export async function createWorkflow(
  appId: string,
  data: Pick<WorkflowConfig, "name" | "description" | "trigger" | "steps">
) {
  return prisma.workflow.create({
    data: {
      appId,
      name: data.name,
      description: data.description,
      trigger: data.trigger as any,
      steps: data.steps as any,
    },
  });
}

export async function updateWorkflow(
  workflowId: string,
  appId: string,
  data: Partial<Pick<WorkflowConfig, "name" | "description" | "trigger" | "steps" | "isActive">>
) {
  return prisma.workflow.updateMany({
    where: { id: workflowId, appId },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.trigger !== undefined && { trigger: data.trigger as any }),
      ...(data.steps !== undefined && { steps: data.steps as any }),
      ...(data.isActive !== undefined && { isActive: data.isActive }),
    },
  });
}

export async function deleteWorkflow(workflowId: string, appId: string) {
  return prisma.workflow.updateMany({
    where: { id: workflowId, appId },
    data: { isActive: false },
  });
}

export async function logExecution(
  workflowId: string,
  status: string,
  input?: unknown,
  output?: unknown,
  error?: string
) {
  return prisma.workflowExecution.create({
    data: {
      workflowId,
      status,
      input: input as any,
      output: output as any,
      error,
      finishedAt: ["success", "failed"].includes(status) ? new Date() : undefined,
    },
  });
}

export async function updateExecution(
  executionId: string,
  status: string,
  output?: unknown,
  error?: string
) {
  return prisma.workflowExecution.update({
    where: { id: executionId },
    data: {
      status,
      output: output as any,
      error,
      finishedAt: new Date(),
    },
  });
}

export async function getExecutions(workflowId: string, limit = 20) {
  return prisma.workflowExecution.findMany({
    where: { workflowId },
    orderBy: { startedAt: "desc" },
    take: limit,
  });
}
