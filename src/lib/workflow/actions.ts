// src/lib/workflow/actions.ts
//
// Each action handler receives the step config and the current context
// (input data from the trigger). Returns { output, error? }.

import { WorkflowStep } from "@/types/config.types";

export interface ActionContext {
  triggerData: Record<string, unknown>;
  appId: string;
  previousOutputs: Record<string, unknown>[];
}

export interface ActionResult {
  success: boolean;
  output?: Record<string, unknown>;
  error?: string;
}

export async function executeAction(
  step: WorkflowStep,
  context: ActionContext
): Promise<ActionResult> {
  try {
    switch (step.type) {
      case "sendEmail":
        return await handleSendEmail(step.config, context);
      case "callWebhook":
        return await handleCallWebhook(step.config, context);
      case "transform":
        return handleTransform(step.config, context);
      case "notify":
        return handleNotify(step.config, context);
      case "condition":
        return handleCondition(step.config, context);
      default:
        return {
          success: false,
          error: `Unknown action type: "${step.type}"`,
        };
    }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Action threw an unexpected error",
    };
  }
}

// ── Action handlers ────────────────────────────────────────────────────────────

async function handleSendEmail(
  config: Record<string, unknown>,
  context: ActionContext
): Promise<ActionResult> {
  const { to, subject, body } = config;

  if (!to || !subject) {
    return { success: false, error: "sendEmail requires 'to' and 'subject'" };
  }

  // Interpolate template variables like {{fieldName}}
  const interpolated = {
    to: interpolate(String(to), context.triggerData),
    subject: interpolate(String(subject), context.triggerData),
    body: body ? interpolate(String(body), context.triggerData) : "",
  };

  // TODO: integrate with your email provider (e.g. Resend, SendGrid)
  // Example with Resend:
  // await resend.emails.send({ from: "noreply@yourdomain.com", ...interpolated });

  console.log("[workflow:sendEmail]", interpolated);
  return { success: true, output: { sent: true, ...interpolated } };
}

async function handleCallWebhook(
  config: Record<string, unknown>,
  context: ActionContext
): Promise<ActionResult> {
  const { url, method = "POST", headers = {} } = config;

  if (!url || typeof url !== "string") {
    return { success: false, error: "callWebhook requires a 'url'" };
  }

  const payload = {
    triggerData: context.triggerData,
    appId: context.appId,
    timestamp: new Date().toISOString(),
  };

  const res = await fetch(url, {
    method: String(method).toUpperCase(),
    headers: {
      "Content-Type": "application/json",
      ...(headers as Record<string, string>),
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10_000), // 10 s timeout
  });

  if (!res.ok) {
    return {
      success: false,
      error: `Webhook returned ${res.status}: ${res.statusText}`,
    };
  }

  let responseBody: unknown;
  try {
    responseBody = await res.json();
  } catch {
    responseBody = null;
  }

  return { success: true, output: { status: res.status, body: responseBody } };
}

function handleTransform(
  config: Record<string, unknown>,
  context: ActionContext
): ActionResult {
  // Simple key remapping: { "newKey": "{{oldKey}}" }
  const { mapping } = config as { mapping?: Record<string, string> };

  if (!mapping || typeof mapping !== "object") {
    return { success: false, error: "transform requires a 'mapping' object" };
  }

  const result: Record<string, unknown> = {};
  for (const [newKey, template] of Object.entries(mapping)) {
    result[newKey] = interpolate(template, context.triggerData);
  }

  return { success: true, output: result };
}

function handleNotify(
  config: Record<string, unknown>,
  context: ActionContext
): ActionResult {
  // In-app notification (stored to DB / pushed via SSE in a full implementation)
  const message = config.message
    ? interpolate(String(config.message), context.triggerData)
    : "Workflow triggered";

  console.log("[workflow:notify]", message);
  // TODO: push to your notification system
  return { success: true, output: { notified: true, message } };
}

function handleCondition(
  config: Record<string, unknown>,
  context: ActionContext
): ActionResult {
  // Simple field-equality check: { field: "status", operator: "eq", value: "active" }
  const { field, operator = "eq", value } = config;

  if (!field) {
    return { success: false, error: "condition requires a 'field'" };
  }

  const actual = context.triggerData[String(field)];
  let passed = false;

  switch (operator) {
    case "eq":  passed = actual == value;  break;
    case "neq": passed = actual != value;  break;
    case "gt":  passed = Number(actual) > Number(value); break;
    case "lt":  passed = Number(actual) < Number(value); break;
    case "contains":
      passed = String(actual).includes(String(value)); break;
    default:
      return { success: false, error: `Unknown operator: "${operator}"` };
  }

  return { success: true, output: { conditionPassed: passed, field, actual } };
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Replace {{key}} tokens in a template string with values from a data object */
function interpolate(
  template: string,
  data: Record<string, unknown>
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const val = data[key];
    return val !== null && val !== undefined ? String(val) : "";
  });
}
