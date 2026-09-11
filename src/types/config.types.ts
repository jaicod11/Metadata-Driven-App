// src/types/config.types.ts

// ─── Field ────────────────────────────────────────────────────────────────────

export type FieldType =
  | "string"
  | "number"
  | "boolean"
  | "date"
  | "select"
  | "file"
  | "email"
  | "url"
  | "textarea";

export interface SelectOption {
  label: string;
  value: string;
}

/**
 * Validation rules for a single field. Declared once here and enforced in both
 * places by src/lib/runtime/validator.ts — the generated form (client) and the
 * runtime API routes (server).
 */
export interface FieldValidation {
  required?: boolean;             // same rule as FieldConfig.required; either enables it
  min?: number;                   // numeric minimum
  max?: number;                   // numeric maximum
  minLength?: number;             // string length
  maxLength?: number;             // string length
  regex?: string;                 // regular expression source, e.g. "^[A-Z]{2}-\\d+$"
  pattern?: string;               // older spelling of "regex"; still honoured
  email?: boolean;                // implied by type "email"
  unique?: boolean;               // no other record of this entity may hold the value
  message?: string;               // custom error message, used for every rule on the field
}

export interface FieldConfig {
  name: string;
  type: FieldType;
  label?: string;
  required?: boolean;
  placeholder?: string;
  defaultValue?: unknown;
  helpText?: string;
  options?: SelectOption[];       // for "select" type
  validation?: FieldValidation;
  hidden?: boolean;               // hide from UI but still include in data
}

// ─── Entity ───────────────────────────────────────────────────────────────────

export interface EntityConfig {
  name: string;
  label?: string;
  fields: FieldConfig[];
}

// ─── Layout & Page ────────────────────────────────────────────────────────────

export type LayoutType =
  | "form"
  | "table"
  | "dashboard"
  | "grid"
  | "tabs"
  | "stack";

export interface ActionConfig {
  label: string;
  type: "submit" | "reset" | "navigate" | "delete" | "workflow";
  target?: string;    // path to navigate to
  workflowId?: string;
  variant?: "primary" | "secondary" | "danger";
}

export interface ComponentConfig {
  type: string;
  entity?: string;
  title?: string;
  fields?: string[];  // subset of entity fields to show; empty = show all
  actions?: ActionConfig[];
  props?: Record<string, unknown>;
}

export interface PageConfig {
  path: string;
  title?: string;
  layout: LayoutType;
  entity?: string;      // which entity this page operates on
  components?: ComponentConfig[];
}

// ─── Workflow ─────────────────────────────────────────────────────────────────

export type TriggerType =
  | "onSubmit"
  | "onUpdate"
  | "onDelete"
  | "schedule"
  | "manual";

export interface WorkflowTrigger {
  type: TriggerType;
  entity?: string;
  cron?: string;  // for "schedule" type
}

export type ActionType =
  | "sendEmail"
  | "callWebhook"
  | "transform"
  | "notify"
  | "condition";

export interface WorkflowStep {
  id?: string;
  type: ActionType;
  name?: string;
  config: Record<string, unknown>;
}

export interface WorkflowConfig {
  id?: string;
  name: string;
  description?: string;
  trigger: WorkflowTrigger;
  steps: WorkflowStep[];
  isActive?: boolean;
}

// ─── App Config (root) ────────────────────────────────────────────────────────

export interface ThemeConfig {
  primaryColor?: string;
  fontFamily?: string;
  borderRadius?: "none" | "sm" | "md" | "lg";
}

export interface AppConfig {
  name: string;
  description?: string;
  version?: string;
  theme?: ThemeConfig;
  entities: EntityConfig[];
  pages: PageConfig[];
  workflows?: WorkflowConfig[];
}

// ─── Parsed result (from schema-parser.ts) ────────────────────────────────────

export interface ConfigError {
  path: string;
  message: string;
}

export interface ConfigWarning {
  path: string;
  message: string;
}

export interface ParsedConfig {
  valid: boolean;
  config: AppConfig | null;
  errors: ConfigError[];
  warnings: ConfigWarning[];
}
