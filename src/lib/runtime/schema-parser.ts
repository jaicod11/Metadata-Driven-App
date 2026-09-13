// src/lib/runtime/schema-parser.ts
//
// Parses raw JSON into a validated, normalised AppConfig.
// The golden rule: NEVER throw — always return errors/warnings instead.
// Unknown field types, missing pages, bad references → warnings, not crashes.
//
// Structure is checked first by the Zod gate in src/lib/config-schema.ts, which
// reports *which entity / field / page* is wrong. Everything that can be
// recovered from is normalised here and recorded as a warning.

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
  RelationType,
  RoleConfig,
  WidgetConfig,
  WidgetType,
  WorkflowConfig,
} from "@/types/config.types";
import {
  AGGREGATE_OPS,
  CHART_KINDS,
  DEFAULT_CHART_LIMIT,
  DEFAULT_CONFIG_VERSION,
  FIELD_TYPES,
  MAX_CHART_LIMIT,
  WIDGET_TYPES,
  LAYOUT_TYPES,
  RELATION_TYPES,
  TRIGGER_TYPES,
  validateAppConfig,
} from "@/lib/config-schema";
import { findInverseField, isHasMany, isRelation } from "@/lib/runtime/relations";

// ─── Public API ───────────────────────────────────────────────────────────────

/** Parse a raw JSON value (already decoded) into a normalised AppConfig. */
export function parseConfig(raw: unknown): ParsedConfig {
  const errors: ConfigError[] = [];
  const warnings: ConfigWarning[] = [];

  // ── structural gate ───────────────────────────────────────────────────────
  // Zod validates the shape before anything below reads it, so a broken config
  // surfaces as "entity X → field Y is invalid" instead of crashing downstream
  // (buildEntitySchema, z.enum, new RegExp) on values that can't be recovered.
  const validated = validateAppConfig(raw);
  if (!validated.success) {
    return { valid: false, config: null, errors: validated.errors, warnings: [] };
  }

  // Guaranteed by the gate: an object with a non-empty "name" and an "entities"
  // array whose items are objects with non-empty names.
  const data = raw as Record<string, unknown>;
  const appName = String(data.name).trim();

  // ── entities ──────────────────────────────────────────────────────────────
  const entities: EntityConfig[] = [];
  const rawEntities = Array.isArray(data.entities) ? data.entities : [];
  rawEntities.forEach((e, i) => {
    const parsed = parseEntity(e, `entities[${i}]`, errors, warnings);
    if (parsed) entities.push(parsed);
  });

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

  // ── roles ─────────────────────────────────────────────────────────────────
  const roles = parseRoles(data.roles, warnings);

  // ── relations ─────────────────────────────────────────────────────────────
  // Targets are verified by the gate; what's left are the soft references that
  // degrade to a warning.
  checkRelations(entities, warnings);

  const config: AppConfig = {
    name: appName,
    description: typeof data.description === "string" ? data.description.trim() : undefined,
    version: typeof data.version === "string" ? data.version : DEFAULT_CONFIG_VERSION,
    roles,
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
    permissions: permissionMap(data.permissions),
  };
}

/**
 * Roles normalise to objects, so `["admin", "viewer"]` and the object form mean
 * the same thing downstream. Duplicates and extra defaults have an obvious
 * fallback — first one wins — so they warn rather than block.
 */
function parseRoles(raw: unknown, warnings: ConfigWarning[]): RoleConfig[] | undefined {
  if (!Array.isArray(raw)) return undefined;

  const roles: RoleConfig[] = [];
  const seen = new Set<string>();
  let defaultRole: string | null = null;

  raw.forEach((entry, i) => {
    const path = `roles[${i}]`;
    const source =
      typeof entry === "string"
        ? { name: entry }
        : entry && typeof entry === "object" && !Array.isArray(entry)
        ? (entry as Record<string, unknown>)
        : null;

    if (!source || typeof source.name !== "string" || !source.name.trim()) return;

    const name = source.name.trim();
    if (seen.has(name)) {
      warnings.push({
        path: `${path}.name`,
        message: `Duplicate role "${name}" — keeping the first one`,
      });
      return;
    }
    seen.add(name);

    let isDefault = source.default === true;
    if (isDefault && defaultRole) {
      warnings.push({
        path: `${path}.default`,
        message: `Role "${name}" is also marked default; "${defaultRole}" already is — keeping "${defaultRole}"`,
      });
      isDefault = false;
    }
    if (isDefault) defaultRole = name;

    roles.push({
      name,
      label: typeof source.label === "string" ? source.label.trim() : name,
      users: Array.isArray(source.users)
        ? source.users.filter((u): u is string => typeof u === "string")
        : undefined,
      default: isDefault || undefined,
    });
  });

  return roles;
}

/** Permission maps are shape-checked by the gate; keep only object entries. */
function permissionMap<T>(raw: unknown): Record<string, T> | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;

  const entries = Object.entries(raw as Record<string, unknown>).filter(
    ([, rule]) => rule && typeof rule === "object" && !Array.isArray(rule)
  );
  return entries.length > 0
    ? (Object.fromEntries(entries) as Record<string, T>)
    : undefined;
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
  } else if (!FIELD_TYPES.includes(data.type as FieldType)) {
    warnings.push({
      path: `${path}.type`,
      message: `Unknown field type "${data.type}" on "${fieldName}" — defaulting to "string"`,
    });
  } else {
    type = data.type as FieldType;
  }

  // ── relation: kind falls back like every other unknown enum ───────────────
  let relationType: RelationType | undefined;
  if (type === "relation") {
    if (!data.relationType) {
      relationType = "belongsTo";
      warnings.push({
        path: `${path}.relationType`,
        message: `Relation "${fieldName}" in "${entityName}" has no relationType — defaulting to "belongsTo"`,
      });
    } else if (!RELATION_TYPES.includes(data.relationType as RelationType)) {
      relationType = "belongsTo";
      warnings.push({
        path: `${path}.relationType`,
        message: `Unknown relationType "${data.relationType}" on "${fieldName}" — defaulting to "belongsTo"`,
      });
    } else {
      relationType = data.relationType as RelationType;
    }
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
    // Coerced to strings: buildEntitySchema feeds these to z.enum(), which
    // rejects non-string members.
    options: Array.isArray(data.options)
      ? data.options
          .filter(
            (o): o is Record<string, unknown> =>
              typeof o === "object" && o !== null &&
              "label" in o && "value" in o
          )
          .map((o) => ({ label: String(o.label), value: String(o.value) }))
      : undefined,
    validation:
      data.validation && typeof data.validation === "object" && !Array.isArray(data.validation)
        ? (data.validation as FieldConfig["validation"])
        : undefined,
    // Relation wiring — the gate guarantees "target" names a defined entity.
    target:
      type === "relation" && typeof data.target === "string"
        ? data.target.trim()
        : undefined,
    relationType,
    displayField:
      type === "relation" && typeof data.displayField === "string"
        ? data.displayField.trim()
        : undefined,
    foreignKey:
      type === "relation" && typeof data.foreignKey === "string"
        ? data.foreignKey.trim()
        : undefined,
    // Checked against its sibling fields by the gate; evaluated at render time.
    expression:
      type === "computed" && typeof data.expression === "string"
        ? data.expression.trim()
        : undefined,
    permissions: permissionMap(data.permissions),
  };
}

/**
 * Relation references that have a sensible fallback, so they warn instead of
 * blocking: a displayField that isn't a field of the target, and a hasMany
 * whose inverse belongsTo can't be found (the list renders empty).
 */
function checkRelations(entities: EntityConfig[], warnings: ConfigWarning[]) {
  entities.forEach((entity, ei) => {
    entity.fields.forEach((field, fi) => {
      if (!isRelation(field)) return;

      const path = `entities[${ei}].fields[${fi}]`;
      const target = entities.find((e) => e.name === field.target);
      if (!target) return; // already an error from the gate

      if (
        field.displayField &&
        !target.fields.some((f) => f.name === field.displayField)
      ) {
        warnings.push({
          path: `${path}.displayField`,
          message: `Relation "${field.name}" wants to display "${field.displayField}", which entity "${target.name}" does not define — falling back to its first text field`,
        });
      }

      if (isHasMany(field) && !findInverseField(entity, target, field)) {
        warnings.push({
          path: `${path}.foreignKey`,
          message:
            `Relation "${field.name}" is hasMany but no field of "${target.name}" points back at "${entity.name}" — ` +
            `add a belongsTo field there, or name it with "foreignKey". The list will render empty.`,
        });
      }
    });
  });
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
  } else if (!LAYOUT_TYPES.includes(data.layout as LayoutType)) {
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

  // ── widgets ───────────────────────────────────────────────────────────────
  const widgets = parseWidgets(data.widgets, layout, pagePath, path, warnings);

  return {
    path: pagePath,
    title: typeof data.title === "string" ? data.title.trim() : undefined,
    layout,
    entity: typeof data.entity === "string" ? data.entity : undefined,
    widgets,
  };
}

/**
 * Dashboard tiles. Entity and field references are verified by the gate, so
 * what is left here degrades: an unknown widget type is dropped (there is
 * nothing to guess), and an unknown op or chart kind falls back like any other
 * unknown enum.
 */
function parseWidgets(
  raw: unknown,
  layout: LayoutType,
  pagePath: string,
  path: string,
  warnings: ConfigWarning[]
): WidgetConfig[] | undefined {
  if (!Array.isArray(raw)) return undefined;

  if (raw.length > 0 && layout !== "dashboard") {
    warnings.push({
      path: `${path}.widgets`,
      message: `Page "${pagePath}" declares widgets but its layout is "${layout}" — only the "dashboard" layout renders them`,
    });
  }

  const widgets: WidgetConfig[] = [];

  raw.forEach((entry, i) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return;
    const data = entry as Record<string, unknown>;
    const at = `${path}.widgets[${i}]`;

    if (!WIDGET_TYPES.includes(data.type as WidgetType)) {
      warnings.push({
        path: `${at}.type`,
        message: data.type
          ? `Unknown widget type "${data.type}" on page "${pagePath}" — skipping this widget`
          : `Widget on page "${pagePath}" has no type — skipping it`,
      });
      return;
    }
    const type = data.type as WidgetType;

    let op: WidgetConfig["op"];
    if (type === "aggregate") {
      if (AGGREGATE_OPS.includes(data.op as NonNullable<WidgetConfig["op"]>)) {
        op = data.op as WidgetConfig["op"];
      } else {
        op = "sum";
        if (data.op !== undefined) {
          warnings.push({
            path: `${at}.op`,
            message: `Unknown aggregate op "${data.op}" — defaulting to "sum"`,
          });
        }
      }
    }

    let chart: WidgetConfig["chart"];
    if (type === "chart") {
      if (CHART_KINDS.includes(data.chart as NonNullable<WidgetConfig["chart"]>)) {
        chart = data.chart as WidgetConfig["chart"];
      } else {
        chart = "bar";
        if (data.chart !== undefined) {
          warnings.push({
            path: `${at}.chart`,
            message: `Unknown chart type "${data.chart}" — defaulting to "bar"`,
          });
        }
      }
    }

    const filter =
      data.filter && typeof data.filter === "object" && !Array.isArray(data.filter)
        ? (Object.fromEntries(
            Object.entries(data.filter as Record<string, unknown>).filter(
              ([, v]) =>
                typeof v === "string" || typeof v === "number" || typeof v === "boolean"
            )
          ) as WidgetConfig["filter"])
        : undefined;

    widgets.push({
      type,
      title: typeof data.title === "string" ? data.title.trim() : undefined,
      entity: String(data.entity).trim(),
      field: typeof data.field === "string" ? data.field.trim() : undefined,
      op,
      chart,
      filter,
      limit:
        type === "chart" && typeof data.limit === "number"
          ? Math.min(Math.max(1, Math.floor(data.limit)), MAX_CHART_LIMIT)
          : type === "chart"
          ? DEFAULT_CHART_LIMIT
          : undefined,
    });
  });

  return widgets;
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

  const trigger = data.trigger as Record<string, unknown> | undefined;
  if (!trigger || !TRIGGER_TYPES.includes(trigger?.type as WorkflowConfig["trigger"]["type"])) {
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
