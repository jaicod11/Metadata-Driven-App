// src/lib/workflow/triggers.ts
// Human-readable labels and metadata for workflow trigger types

export const TRIGGER_LABELS: Record<string, string> = {
  onSubmit: "When a record is created",
  onUpdate: "When a record is updated",
  onDelete: "When a record is deleted",
  schedule: "On a schedule (cron)",
  manual:   "Manually triggered",
};

export const TRIGGER_ICONS: Record<string, string> = {
  onSubmit: "✅",
  onUpdate: "✏️",
  onDelete: "🗑️",
  schedule: "⏰",
  manual:   "▶️",
};

export const ACTION_LABELS: Record<string, string> = {
  sendEmail:    "Send Email",
  callWebhook:  "Call Webhook",
  transform:    "Transform Data",
  notify:       "Send Notification",
  condition:    "Conditional Branch",
};

export const ACTION_ICONS: Record<string, string> = {
  sendEmail:   "📧",
  callWebhook: "🌐",
  transform:   "🔄",
  notify:      "🔔",
  condition:   "🔀",
};

/** Default config template for each action type */
export const ACTION_DEFAULT_CONFIGS: Record<string, Record<string, unknown>> = {
  sendEmail:   { to: "{{email}}", subject: "New record submitted", body: "Hello {{name}}" },
  callWebhook: { url: "https://your-webhook.com/endpoint", method: "POST" },
  transform:   { mapping: { newField: "{{existingField}}" } },
  notify:      { message: "New record: {{name}}" },
  condition:   { field: "status", operator: "eq", value: "active" },
};
