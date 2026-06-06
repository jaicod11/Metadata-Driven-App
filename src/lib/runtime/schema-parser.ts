// src/lib/runtime/schema-parser.ts
//
// Parses raw JSON into a validated, normalised AppConfig.
// The golden rule: NEVER throw — always return errors/warnings instead.
// Unknown field types, missing pages, bad references → warnings, not crashes.

import {
  AppConfig,
  EntityConfig,
  FieldConfig,
  FieldType,
  LayoutType,
  PageConfig,
  ParsedConfig,
  ConfigError,
  ConfigWarning,
  WorkflowConfig,
} from "@/types/config.types";

const VALID_FIELD_TYPES: FieldType[] = [
  "string", "number", "boolean", "date",
  "select", "file", "email", "url", "textarea",
];

const VALID_LAYOUT_TYPES: LayoutType[] = [
  "form", "table", "dashboard", "grid", "tabs", "stack",
];

// ─── Public API ───────────────────────────────────────────────────────────────

/** Parse a raw JSON value (already decoded) into a normalised AppConfig. */
export function parseConfig(raw: unknown): ParsedConfig {
  const errors: ConfigError[] = [];
  const warnings: ConfigWarning[] = [];

  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {
      valid: false,
      config: null,
      errors: [{ path: "root", message: "Config must be a JSON object" }],
      warnings: [],
    };
  }

  const data = raw as Record<string, unknown>;

  // ── name ──────────────────────────────────────────────────────────────────
  let appName = "Unnamed App";
  if (!data.name || typeof data.name !== "string" || !data.name.trim()) {
    errors.push({ path: "name", message: "App name is required (non-empty string)" });
  } else {
    appName = data.name.trim();
  }

  // ── entities ──────────────────────────────────────────────────────────────
  const entities: EntityConfig[] = [];
  if (!Array.isArray(data.entities)) {
    errors.push({ path: "entities", message: "\"entities\" must be an array" });
  } else {
    data.entities.forEach((e, i) => {
      const parsed = parseEntity(e, `entities[${i}]`, errors, warnings);
      if (parsed) entities.push(parsed);
    });
  }

  // ── pages ─────────────────────────────────────────────────────────────────
  const pages: PageConfig[] = [];
  if (!Array.isArray(data.pages)) {
    warnings.push({ path: "pages", message: "No pages defined; the app will have no routes" });
  } else {
    data.pages.forEach((p, i) => {
      const parsed = parsePage(p, `pages[${i}]`, entities, errors, warnings);
      if (parsed) pages.push(parsed);
    });
  }

  // ── workflows (optional) ──────────────────────────────────────────────────
  const workflows: WorkflowConfig[] = [];
  if (Array.isArray(data.workflows)) {
    data.workflows.forEach((w, i) => {
      const parsed = parseWorkflow(w, `workflows[${i}]`, entities, warnings);
      if (parsed) workflows.push(parsed);
    });
  }

  const config: AppConfig = {
    name: appName,
    description: typeof data.description === "string" ? data.description.trim() : undefined,
    version: typeof data.version === "string" ? data.version : "1.0.0",
    entities,
    pages,
    workflows,
    theme: parseTheme(data.theme),
  };

  return { valid: errors.length === 0, config, errors, warnings };
}

/** Convenience wrapper — parses from a raw JSON string. */
export function parseConfigFromString(json: string): ParsedConfig {
  try {
    return parseConfig(JSON.parse(json));
  } catch {
    return {
      valid: false,
      config: null,
      errors: [{ path: "root", message: "Invalid JSON — could not parse the string" }],
      warnings: [],
    };
  }
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function parseEntity(
  raw: unknown,
  path: string,
  errors: ConfigError[],
  warnings: ConfigWarning[]
): EntityConfig | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    errors.push({ path, message: "Each entity must be an object" });
    return null;
  }

  const data = raw as Record<string, unknown>;

  if (!data.name || typeof data.name !== "string" || !data.name.trim()) {
    errors.push({ path: `${path}.name`, message: "Entity name is required" });
    return null;
  }

  const entityName = data.name.trim();
  const fields: FieldConfig[] = [];

  if (!Array.isArray(data.fields) || data.fields.length === 0) {
    warnings.push({
      path: `${path}.fields`,
      message: `Entity "${entityName}" has no fields — it will render as empty`,
    });
  } else {
    const seenNames = new Set<string>();
    data.fields.forEach((f, i) => {
      const parsed = parseField(f, `${path}.fields[${i}]`, entityName, errors, warnings);
      if (parsed) {
        if (seenNames.has(parsed.name)) {
          warnings.push({
            path: `${path}.fields[${i}].name`,
            message: `Duplicate field name "${parsed.name}" in entity "${entityName}" — skipping`,
          });
        } else {
          seenNames.add(parsed.name);
          fields.push(parsed);
        }
      }
    });
  }

  return {
    name: entityName,
    label: typeof data.label === "string" ? data.label.trim() : entityName,
    fields,
  };
}

function parseField(
  raw: unknown,
  path: string,
  entityName: string,
  errors: ConfigError[],
  warnings: ConfigWarning[]
): FieldConfig | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    errors.push({ path, message: "Each field must be an object" });
    return null;
  }

  const data = raw as Record<string, unknown>;

  if (!data.name || typeof data.name !== "string" || !data.name.trim()) {
    errors.push({ path: `${path}.name`, message: "Field name is required" });
    return null;
  }

  const fieldName = data.name.trim();

  // ── type: graceful fallback to "string" ───────────────────────────────────
  let type: FieldType = "string";
  if (!data.type) {
    warnings.push({
      path: `${path}.type`,
      message: `Field "${fieldName}" in "${entityName}" has no type — defaulting to "string"`,
    });
  } else if (!VALID_FIELD_TYPES.includes(data.type as FieldType)) {
    warnings.push({
      path: `${path}.type`,
      message: `Unknown field type "${data.type}" on "${fieldName}" — defaulting to "string"`,
    });
  } else {
    type = data.type as FieldType;
  }

  // ── options: required for select, warn otherwise ──────────────────────────
  if (type === "select" && !Array.isArray(data.options)) {
    warnings.push({
      path: `${path}.options`,
      message: `Field "${fieldName}" is type "select" but has no options array`,
    });
  }

  return {
    name: fieldName,
    type,
    label: typeof data.label === "string" ? data.label.trim() : fieldName,
    required: typeof data.required === "boolean" ? data.required : false,
    placeholder: typeof data.placeholder === "string" ? data.placeholder : undefined,
    defaultValue: data.defaultValue ?? undefined,
    helpText: typeof data.helpText === "string" ? data.helpText : undefined,
    hidden: typeof data.hidden === "boolean" ? data.hidden : false,
    options: Array.isArray(data.options)
      ? data.options.filter(
          (o): o is { label: string; value: string } =>
            typeof o === "object" && o !== null &&
            "label" in o && "value" in o
        )
      : undefined,
    validation:
      data.validation && typeof data.validation === "object" && !Array.isArray(data.validation)
        ? (data.validation as FieldConfig["validation"])
        : undefined,
  };
}

function parsePage(
  raw: unknown,
  path: string,
  entities: EntityConfig[],
  errors: ConfigError[],
  warnings: ConfigWarning[]
): PageConfig | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    errors.push({ path, message: "Each page must be an object" });
    return null;
  }

  const data = raw as Record<string, unknown>;

  if (!data.path || typeof data.path !== "string" || !data.path.trim()) {
    errors.push({ path: `${path}.path`, message: "Page path is required" });
    return null;
  }

  const pagePath = data.path.trim();

  // ── layout: graceful fallback ──────────────────────────────────────────────
  let layout: LayoutType = "table";
  if (!data.layout) {
    warnings.push({
      path: `${path}.layout`,
      message: `Page "${pagePath}" has no layout — defaulting to "table"`,
    });
  } else if (!VALID_LAYOUT_TYPES.includes(data.layout as LayoutType)) {
    warnings.push({
      path: `${path}.layout`,
      message: `Unknown layout "${data.layout}" on page "${pagePath}" — defaulting to "table"`,
    });
  } else {
    layout = data.layout as LayoutType;
  }

  // ── entity reference check (warning, not error) ────────────────────────────
  if (data.entity && typeof data.entity === "string") {
    const exists = entities.some((e) => e.name === data.entity);
    if (!exists) {
      warnings.push({
        path: `${path}.entity`,
        message: `Page "${pagePath}" references entity "${data.entity}" which is not defined`,
      });
    }
  }

  return {
    path: pagePath,
    title: typeof data.title === "string" ? data.title.trim() : undefined,
    layout,
    entity: typeof data.entity === "string" ? data.entity : undefined,
  };
}

function parseWorkflow(
  raw: unknown,
  path: string,
  entities: EntityConfig[],
  warnings: ConfigWarning[]
): WorkflowConfig | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    warnings.push({ path, message: "Each workflow must be an object — skipping" });
    return null;
  }

  const data = raw as Record<string, unknown>;

  if (!data.name || typeof data.name !== "string") {
    warnings.push({ path: `${path}.name`, message: "Workflow has no name — skipping" });
    return null;
  }

  const VALID_TRIGGERS = ["onSubmit", "onUpdate", "onDelete", "schedule", "manual"];
  const trigger = data.trigger as Record<string, unknown> | undefined;
  if (!trigger || !VALID_TRIGGERS.includes(trigger?.type as string)) {
    warnings.push({
      path: `${path}.trigger`,
      message: `Workflow "${data.name}" has an invalid trigger — skipping`,
    });
    return null;
  }

  return {
    name: data.name,
    description: typeof data.description === "string" ? data.description : undefined,
    trigger: trigger as WorkflowConfig["trigger"],
    steps: Array.isArray(data.steps) ? data.steps as WorkflowConfig["steps"] : [],
    isActive: typeof data.isActive === "boolean" ? data.isActive : true,
  };
}

function parseTheme(raw: unknown): AppConfig["theme"] {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const data = raw as Record<string, unknown>;
  return {
    primaryColor: typeof data.primaryColor === "string" ? data.primaryColor : undefined,
    fontFamily: typeof data.fontFamily === "string" ? data.fontFamily : undefined,
  };
}
