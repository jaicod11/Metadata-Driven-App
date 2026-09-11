// src/lib/config-schema.ts
//
// Zod schemas for the app config JSON, checked at load time by parseConfig().
//
// Two layers, on purpose:
//
//   appConfigInputSchema — the gate for raw, user-supplied JSON. Strict about the
//     structure the runtime cannot recover from (a missing entity/field name, an
//     "entities" value that isn't an array, a validation block with a non-numeric
//     min, a select option whose value isn't a scalar). Deliberately loose
//     everywhere graceful degradation is possible: an unknown field type, an
//     unknown layout, a wrong-typed label. Those stay *warnings* in
//     schema-parser.ts — see the graceful-degradation rule in CLAUDE.md.
//
//   appConfigSchema — the strict shape of an already-normalised AppConfig. Every
//     schema is checked against its interface in src/types/config.types.ts with
//     `satisfies`, so the schemas and the TypeScript types cannot drift apart.
//
// Nothing here throws on invalid input except the opt-in assertValidAppConfig().
// validateAppConfig() returns ConfigError[] whose messages name the offending
// entity / field / page, e.g.
//
//   entity "employee" → field "salary" → validation → min: "min" in "validation"
//   must be a number

import { z } from "zod";
import type {
  ActionConfig,
  ActionType,
  AppConfig,
  ComponentConfig,
  ConfigError,
  EntityConfig,
  FieldConfig,
  FieldType,
  FieldValidation,
  LayoutType,
  PageConfig,
  RelationType,
  SelectOption,
  ThemeConfig,
  TriggerType,
  WorkflowConfig,
  WorkflowStep,
  WorkflowTrigger,
} from "@/types/config.types";

// ─── Enumerations ─────────────────────────────────────────────────────────────
// Single source of truth for the string unions in config.types.ts. `satisfies`
// keeps each list in sync with its type; schema-parser.ts imports these rather
// than keeping its own copies.

export const FIELD_TYPES = [
  "string", "number", "boolean", "date",
  "select", "file", "email", "url", "textarea", "relation",
] as const satisfies readonly FieldType[];

export const RELATION_TYPES = [
  "belongsTo", "hasMany",
] as const satisfies readonly RelationType[];

export const LAYOUT_TYPES = [
  "form", "table", "dashboard", "detail", "grid", "tabs", "stack",
] as const satisfies readonly LayoutType[];

export const TRIGGER_TYPES = [
  "onSubmit", "onUpdate", "onDelete", "schedule", "manual",
] as const satisfies readonly TriggerType[];

export const WORKFLOW_ACTION_TYPES = [
  "sendEmail", "callWebhook", "transform", "notify", "condition",
] as const satisfies readonly ActionType[];

export const PAGE_ACTION_TYPES = [
  "submit", "reset", "navigate", "delete", "workflow",
] as const satisfies readonly ActionConfig["type"][];

export const ACTION_VARIANTS = [
  "primary", "secondary", "danger",
] as const satisfies readonly NonNullable<ActionConfig["variant"]>[];

export const BORDER_RADIUS_VALUES = [
  "none", "sm", "md", "lg",
] as const satisfies readonly NonNullable<ThemeConfig["borderRadius"]>[];

/**
 * Version assumed when a config omits "version". A config written before the
 * field existed is a 1.0.0 config; future format changes bump this and migrate
 * off the stored value.
 */
export const DEFAULT_CONFIG_VERSION = "1.0.0";

// ─── Strict schemas (shape of a normalised AppConfig) ─────────────────────────

export const fieldTypeSchema = z.enum(FIELD_TYPES);
export const relationTypeSchema = z.enum(RELATION_TYPES);
export const layoutTypeSchema = z.enum(LAYOUT_TYPES);
export const triggerTypeSchema = z.enum(TRIGGER_TYPES);
export const workflowActionTypeSchema = z.enum(WORKFLOW_ACTION_TYPES);

export const selectOptionSchema = z.object({
  label: z.string(),
  value: z.string(),
}) satisfies z.ZodType<SelectOption>;

export const fieldValidationSchema = z.object({
  required: z.boolean().optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  minLength: z.number().optional(),
  maxLength: z.number().optional(),
  regex: z.string().optional(),
  pattern: z.string().optional(),
  email: z.boolean().optional(),
  unique: z.boolean().optional(),
  message: z.string().optional(),
}) satisfies z.ZodType<FieldValidation>;

export const fieldSchema = z.object({
  name: z.string(),
  type: fieldTypeSchema,
  label: z.string().optional(),
  required: z.boolean().optional(),
  placeholder: z.string().optional(),
  defaultValue: z.unknown().optional(),
  helpText: z.string().optional(),
  options: z.array(selectOptionSchema).optional(),
  validation: fieldValidationSchema.optional(),
  hidden: z.boolean().optional(),
  // Relation fields — target is checked against the entity list by
  // relationReferenceErrors() below, which Zod alone cannot do.
  target: z.string().optional(),
  relationType: relationTypeSchema.optional(),
  displayField: z.string().optional(),
  foreignKey: z.string().optional(),
}) satisfies z.ZodType<FieldConfig>;

export const entitySchema = z.object({
  name: z.string(),
  label: z.string().optional(),
  fields: z.array(fieldSchema),
}) satisfies z.ZodType<EntityConfig>;

// ─── Views: pages, their layout, and the components inside them ───────────────

export const actionSchema = z.object({
  label: z.string(),
  type: z.enum(PAGE_ACTION_TYPES),
  target: z.string().optional(),
  workflowId: z.string().optional(),
  variant: z.enum(ACTION_VARIANTS).optional(),
}) satisfies z.ZodType<ActionConfig>;

export const componentSchema = z.object({
  type: z.string(),
  entity: z.string().optional(),
  title: z.string().optional(),
  fields: z.array(z.string()).optional(),
  actions: z.array(actionSchema).optional(),
  props: z.record(z.unknown()).optional(),
}) satisfies z.ZodType<ComponentConfig>;

export const pageSchema = z.object({
  path: z.string(),
  title: z.string().optional(),
  layout: layoutTypeSchema,
  entity: z.string().optional(),
  components: z.array(componentSchema).optional(),
}) satisfies z.ZodType<PageConfig>;

// ─── Workflows ────────────────────────────────────────────────────────────────

export const workflowTriggerSchema = z.object({
  type: triggerTypeSchema,
  entity: z.string().optional(),
  cron: z.string().optional(),
}) satisfies z.ZodType<WorkflowTrigger>;

export const workflowStepSchema = z.object({
  id: z.string().optional(),
  type: workflowActionTypeSchema,
  name: z.string().optional(),
  config: z.record(z.unknown()),
}) satisfies z.ZodType<WorkflowStep>;

export const workflowSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  description: z.string().optional(),
  trigger: workflowTriggerSchema,
  steps: z.array(workflowStepSchema),
  isActive: z.boolean().optional(),
}) satisfies z.ZodType<WorkflowConfig>;

export const themeSchema = z.object({
  primaryColor: z.string().optional(),
  fontFamily: z.string().optional(),
  borderRadius: z.enum(BORDER_RADIUS_VALUES).optional(),
}) satisfies z.ZodType<ThemeConfig>;

/** The strict shape of a normalised AppConfig (what parseConfig returns). */
export const appConfigSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  /** Optional; identifies the config format so old configs can be migrated. */
  version: z.string().optional(),
  theme: themeSchema.optional(),
  entities: z.array(entitySchema),
  pages: z.array(pageSchema),
  workflows: z.array(workflowSchema).optional(),
}) satisfies z.ZodType<AppConfig>;

// ─── Input schemas (the load-time gate for raw JSON) ──────────────────────────

/** A required, non-empty string — the class of error that blocks loading. */
const requiredText = (what: string) =>
  z
    .string({
      required_error: `${what} is required (must be a non-empty string)`,
      invalid_type_error: `${what} must be a string`,
    })
    .trim()
    .min(1, `${what} must not be empty`);

/**
 * A property schema-parser can fall back on. Wrong types degrade to a default
 * plus a warning rather than blocking the whole config.
 */
const forgiving = z.unknown().optional();

const scalar = (what: string) =>
  z.union([z.string(), z.number(), z.boolean()], {
    errorMap: () => ({ message: `${what} must be a string, number, or boolean` }),
  });

function isValidRegex(pattern: string): boolean {
  try {
    new RegExp(pattern);
    return true;
  } catch {
    return false;
  }
}

const numericRule = (key: string) =>
  z
    .number({ invalid_type_error: `"${key}" in "validation" must be a number` })
    .optional();

const booleanRule = (key: string) =>
  z
    .boolean({ invalid_type_error: `"${key}" in "validation" must be true or false` })
    .optional();

/** A regex rule is only useful if it compiles — an uncompilable one would throw. */
const regexRule = (key: string) =>
  z
    .string({ invalid_type_error: `"${key}" in "validation" must be a string` })
    .refine(isValidRegex, {
      message: `"${key}" in "validation" is not a valid regular expression`,
    })
    .optional();

const validationInputSchema = z
  .object(
    {
      required: booleanRule("required"),
      min: numericRule("min"),
      max: numericRule("max"),
      minLength: numericRule("minLength"),
      maxLength: numericRule("maxLength"),
      regex: regexRule("regex"),
      // Older spelling of "regex"; both are honoured by the validator.
      pattern: regexRule("pattern"),
      email: booleanRule("email"),
      unique: booleanRule("unique"),
      message: forgiving,
    },
    { invalid_type_error: `"validation" must be an object` }
  )
  .passthrough();

const selectOptionInputSchema = z
  .object(
    {
      // Coerced to strings by schema-parser; a non-scalar would break z.enum().
      label: scalar(`Select option "label"`),
      value: scalar(`Select option "value"`),
    },
    { invalid_type_error: "Each select option must be a { label, value } object" }
  )
  .passthrough();

const fieldInputSchema = z
  .object(
    {
      name: requiredText("Field name"),
      // An unknown *string* type degrades to "string" + a warning, so only the
      // JSON type is enforced here.
      type: z
        .string({
          invalid_type_error: `Field "type" must be a string — one of: ${FIELD_TYPES.join(", ")}`,
        })
        .optional(),
      options: z
        .array(selectOptionInputSchema, {
          invalid_type_error: `Field "options" must be an array of { label, value } objects`,
        })
        .optional(),
      validation: validationInputSchema.optional(),
      // A "relation" needs a target entity; whether that entity exists is
      // checked by relationReferenceErrors(). An unknown relationType degrades
      // to "belongsTo" + a warning, so only the JSON type is enforced here.
      target: z
        .string({ invalid_type_error: `Relation "target" must be an entity name` })
        .optional(),
      relationType: z
        .string({
          invalid_type_error: `Relation "relationType" must be a string — one of: ${RELATION_TYPES.join(", ")}`,
        })
        .optional(),
      displayField: z
        .string({ invalid_type_error: `Relation "displayField" must be a field name` })
        .optional(),
      foreignKey: z
        .string({ invalid_type_error: `Relation "foreignKey" must be a field name` })
        .optional(),
      label: forgiving,
      required: forgiving,
      placeholder: forgiving,
      defaultValue: forgiving,
      helpText: forgiving,
      hidden: forgiving,
    },
    { invalid_type_error: "Each field must be an object" }
  )
  .passthrough();

const entityInputSchema = z
  .object(
    {
      name: requiredText("Entity name"),
      // A missing/empty fields array is only a warning (renders as empty).
      fields: z
        .array(fieldInputSchema, {
          invalid_type_error: `Entity "fields" must be an array of field objects`,
        })
        .optional(),
      label: forgiving,
    },
    { invalid_type_error: "Each entity must be an object" }
  )
  .passthrough();

const componentInputSchema = z
  .object(
    {
      type: requiredText("Component type"),
      entity: forgiving,
      title: forgiving,
      fields: forgiving,
      actions: forgiving,
      props: forgiving,
    },
    { invalid_type_error: "Each component must be an object" }
  )
  .passthrough();

const pageInputSchema = z
  .object(
    {
      path: requiredText("Page path"),
      // An unknown layout degrades to "table" + a warning.
      layout: z
        .string({
          invalid_type_error: `Page "layout" must be a string — one of: ${LAYOUT_TYPES.join(", ")}`,
        })
        .optional(),
      // A reference to an undefined entity is a warning, not an error.
      entity: forgiving,
      title: forgiving,
      components: z
        .array(componentInputSchema, {
          invalid_type_error: `Page "components" must be an array of component objects`,
        })
        .optional(),
    },
    { invalid_type_error: "Each page must be an object" }
  )
  .passthrough();

/**
 * The load-time gate. Unknown keys pass through so a config written for a newer
 * format version still loads on an older deploy.
 */
export const appConfigInputSchema = z
  .object(
    {
      name: requiredText("App name"),
      entities: z.array(entityInputSchema, {
        required_error: `"entities" must be an array of entity objects`,
        invalid_type_error: `"entities" must be an array of entity objects`,
      }),
      // Missing pages is a warning ("the app will have no routes"), not an error.
      pages: z
        .array(pageInputSchema, {
          invalid_type_error: `"pages" must be an array of page objects`,
        })
        .optional(),
      // Individual malformed workflows are skipped with a warning.
      workflows: z
        .array(z.unknown(), { invalid_type_error: `"workflows" must be an array` })
        .optional(),
      /** Optional config format version, for future migrations. */
      version: z
        .string({ invalid_type_error: `"version" must be a string, e.g. "1.0.0"` })
        .optional(),
      description: forgiving,
      theme: forgiving,
    },
    {
      required_error: "Config must be a JSON object",
      invalid_type_error: "Config must be a JSON object",
    }
  )
  .passthrough();

export type AppConfigInput = z.infer<typeof appConfigInputSchema>;

// ─── Human-readable errors ────────────────────────────────────────────────────

/** Singular noun used when describing an item inside a config collection. */
const ITEM_NOUNS: Record<string, string> = {
  entities: "entity",
  fields: "field",
  options: "option",
  pages: "page",
  components: "component",
  actions: "action",
  workflows: "workflow",
  steps: "step",
};

/** Which property identifies an item to a human reading the error. */
const ITEM_NAME_KEYS: Record<string, string> = {
  entities: "name",
  fields: "name",
  options: "label",
  pages: "path",
  components: "type",
  actions: "label",
  workflows: "name",
  steps: "name",
};

function readableName(collection: string, item: unknown): string | null {
  if (!item || typeof item !== "object") return null;
  const key = ITEM_NAME_KEYS[collection];
  if (!key) return null;
  const value = (item as Record<string, unknown>)[key];
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return null;
}

/** `entities[0].fields[2].type` — the machine-readable location. */
export function formatConfigPath(path: (string | number)[]): string {
  return path.reduce<string>((acc, segment) => {
    if (typeof segment === "number") return `${acc}[${segment}]`;
    return acc ? `${acc}.${segment}` : segment;
  }, "");
}

/**
 * `entity "employee" → field "salary" → type` — the human-readable location,
 * resolved against the raw config so entities and fields are named, not indexed.
 */
export function describeConfigPath(raw: unknown, path: (string | number)[]): string {
  const parts: string[] = [];
  let cursor: unknown = raw;
  let i = 0;

  while (i < path.length) {
    const segment = path[i];

    if (typeof segment === "number") {
      cursor = Array.isArray(cursor) ? cursor[segment] : undefined;
      parts.push(`#${segment + 1}`);
      i += 1;
      continue;
    }

    const child =
      cursor && typeof cursor === "object"
        ? (cursor as Record<string, unknown>)[segment]
        : undefined;
    const next = path[i + 1];

    // "entities" followed by an index → name the item rather than the array.
    if (typeof next === "number") {
      const item = Array.isArray(child) ? child[next] : undefined;
      const noun = ITEM_NOUNS[segment] ?? segment;
      const name = readableName(segment, item);
      parts.push(name ? `${noun} "${name}"` : `${noun} #${next + 1}`);
      cursor = item;
      i += 2;
      continue;
    }

    parts.push(segment);
    cursor = child;
    i += 1;
  }

  return parts.join(" → ");
}

/**
 * Build one { path, message } error, named the way the UI renders it:
 * `entity "employee" → field "dept" → target: ...`
 */
export function configError(
  raw: unknown,
  path: (string | number)[],
  message: string
): ConfigError {
  // A top-level property is already named by its own message ("App name is
  // required"), so only nested issues get the "entity X → field Y" prefix.
  const location = path.length > 1 ? describeConfigPath(raw, path) : "";
  return {
    path: formatConfigPath(path) || "root",
    message: location ? `${location}: ${message}` : message,
  };
}

/** Turn a ZodError into the { path, message } pairs the UI already renders. */
export function toConfigErrors(error: z.ZodError, raw?: unknown): ConfigError[] {
  return dedupe(
    error.errors.map((issue) => configError(raw, issue.path, issue.message))
  );
}

function dedupe(errors: ConfigError[]): ConfigError[] {
  const seen = new Set<string>();
  return errors.filter((e) => {
    const key = `${e.path}|${e.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

/**
 * Cross-reference check Zod cannot express on its own: a "relation" field must
 * name a `target` entity, and that entity must exist in this config. Reported
 * as a named error, like a missing entity or field name — a relation pointing
 * nowhere has no sensible fallback, so it blocks the config rather than
 * degrading to a warning.
 */
export function relationReferenceErrors(raw: unknown): ConfigError[] {
  if (!isRecord(raw) || !Array.isArray(raw.entities)) return [];

  const entities = raw.entities;
  const known = new Set(
    entities
      .filter(isRecord)
      .map((e) => (typeof e.name === "string" ? e.name.trim() : ""))
      .filter(Boolean)
  );
  const errors: ConfigError[] = [];

  entities.forEach((entity, entityIndex) => {
    if (!isRecord(entity) || !Array.isArray(entity.fields)) return;

    entity.fields.forEach((field, fieldIndex) => {
      if (!isRecord(field) || field.type !== "relation") return;

      const path = ["entities", entityIndex, "fields", fieldIndex, "target"];
      const target = typeof field.target === "string" ? field.target.trim() : "";

      if (!target) {
        errors.push(
          configError(
            raw,
            path,
            `A "relation" field needs a "target" naming the entity it points at`
          )
        );
        return;
      }

      if (!known.has(target)) {
        errors.push(
          configError(
            raw,
            path,
            `Relation target "${target}" is not a defined entity` +
              (known.size > 0
                ? ` — this config defines: ${Array.from(known).join(", ")}`
                : "")
          )
        );
      }
    });
  });

  return errors;
}

/** One printable block, for logs and non-UI callers. */
export function formatConfigErrors(
  errors: ConfigError[],
  title = "Invalid app config"
): string {
  if (errors.length === 0) return title;
  const header = `${title} (${errors.length} error${errors.length === 1 ? "" : "s"}):`;
  return [header, ...errors.map((e) => `  • ${e.message}  [${e.path}]`)].join("\n");
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface ConfigValidationResult {
  success: boolean;
  data: AppConfigInput | null;
  errors: ConfigError[];
}

/**
 * Validate a raw (already JSON-decoded) config. Never throws — callers get
 * errors that name the entity/field at fault.
 */
export function validateAppConfig(raw: unknown): ConfigValidationResult {
  const result = appConfigInputSchema.safeParse(raw);

  // Structural issues and dangling relation targets are reported together, so
  // one round of fixes clears both.
  const errors = dedupe([
    ...(result.success ? [] : toConfigErrors(result.error, raw)),
    ...relationReferenceErrors(raw),
  ]);

  if (!result.success || errors.length > 0) {
    return { success: false, data: null, errors };
  }
  return { success: true, data: result.data, errors: [] };
}

export class ConfigValidationError extends Error {
  readonly errors: ConfigError[];

  constructor(errors: ConfigError[]) {
    super(formatConfigErrors(errors));
    this.name = "ConfigValidationError";
    this.errors = errors;
  }
}

/**
 * Throwing variant, for scripts and seeds where failing loudly is correct.
 * Request paths use parseConfig(), which never throws.
 */
export function assertValidAppConfig(raw: unknown): AppConfigInput {
  const result = validateAppConfig(raw);
  if (!result.success || !result.data) {
    throw new ConfigValidationError(result.errors);
  }
  return result.data;
}
