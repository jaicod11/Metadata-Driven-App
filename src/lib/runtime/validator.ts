// src/lib/runtime/validator.ts
//
// The single definition of every entity-data validation rule.
//
// Rules are declared per field in the config (FieldConfig.required +
// FieldConfig.validation, whose shape is gated by src/lib/config-schema.ts),
// resolved once by resolveFieldRules(), compiled into a Zod schema by
// buildEntitySchema(), and run by validateEntityData() in BOTH places:
//
//   client — DynamicForm calls it before submitting, to show inline errors
//   server — the runtime API routes call it before writing to AppData
//
// Nothing here touches the database, so it is safe in the client bundle. The one
// rule that cannot be decided without a query — "unique" — lives in
// validator.server.ts, which resolves it from these same rules.

import { z } from "zod";
import { EntityConfig, FieldConfig } from "@/types/config.types";
import { stripUndefined } from "@/lib/utils/validation";
import { isHasMany } from "./relations";

/** One message, attached to the field it belongs to. */
export interface FieldError {
  field: string;
  message: string;
}

export interface ValidationResult {
  success: boolean;
  data?: Record<string, unknown>;
  /** Field-level errors — rendered inline by forms, returned as API details. */
  fieldErrors?: FieldError[];
  /** The same errors flattened to "field: message" (CSV import joins these). */
  errors?: string[];
}

/** The rules for one field, after config spellings have been reconciled. */
export interface FieldRules {
  required: boolean;
  min?: number;
  max?: number;
  minLength?: number;
  maxLength?: number;
  regex?: string;
  email: boolean;
  unique: boolean;
  /** Custom message; when set it replaces the generated one for every rule. */
  message?: string;
}

export function fieldLabel(field: FieldConfig): string {
  return field.label ?? field.name;
}

/**
 * Resolve a field's rules. This is the only place the config spellings are
 * interpreted: `required` may sit on the field or in `validation`, `regex` has
 * the older alias `pattern`, and type "email" implies the email rule.
 */
export function resolveFieldRules(field: FieldConfig): FieldRules {
  const v = field.validation ?? {};
  const num = (n: unknown) => (typeof n === "number" && !isNaN(n) ? n : undefined);
  const str = (s: unknown) => (typeof s === "string" && s.length > 0 ? s : undefined);

  return {
    required: field.required === true || v.required === true,
    min: num(v.min),
    max: num(v.max),
    minLength: num(v.minLength),
    maxLength: num(v.maxLength),
    regex: str(v.regex) ?? str(v.pattern),
    email: v.email === true || field.type === "email",
    unique: v.unique === true,
    message: str(v.message),
  };
}

/** Fields that carry a `unique` rule — resolved by validator.server.ts. */
export function uniqueRuleFields(entity: EntityConfig): FieldConfig[] {
  return entity.fields.filter(
    (f) => !f.hidden && resolveFieldRules(f).unique
  );
}

/** Empty input. A blank never fails a rule other than `required`. */
export function isBlank(value: unknown): boolean {
  return value === undefined || value === null || value === "";
}

/** Build a Zod schema from an EntityConfig at runtime */
export function buildEntitySchema(entity: EntityConfig): z.ZodObject<any> {
  const shape: Record<string, z.ZodTypeAny> = {};

  for (const field of entity.fields) {
    if (field.hidden) continue; // hidden fields are ignored on input
    if (isHasMany(field)) continue; // virtual: children point back at this record

    const rules = resolveFieldRules(field);

    // Every field is optional at the Zod level; `required` is applied on top so
    // it reports "X is required" instead of Zod's bare "Required".
    const optional = buildFieldSchema(field, rules).optional();
    const schema = rules.required
      ? optional.refine((v) => v !== undefined, {
          message: rules.message ?? `${fieldLabel(field)} is required`,
        })
      : optional;

    // A blank ("" from an untouched input, or null) means "no value": it trips
    // `required` and is skipped by every other rule.
    shape[field.name] = z.preprocess(
      (v) => (isBlank(v) ? undefined : v),
      schema
    );
  }

  return z.object(shape);
}

/** Validate data against an entity's schema */
export function validateEntityData(
  data: unknown,
  entity: EntityConfig
): ValidationResult {
  const input =
    data && typeof data === "object" && !Array.isArray(data)
      ? (data as Record<string, unknown>)
      : {};

  try {
    const result = buildEntitySchema(entity).safeParse(input);

    if (!result.success) {
      return toFailure(zodFieldErrors(result.error));
    }

    const clean = stripUndefined(result.data as Record<string, unknown>) as Record<
      string,
      unknown
    >;

    // Keep blanks the caller sent explicitly, so clearing a field still clears
    // it on write. They were only swapped out for the rule checks above.
    for (const field of entity.fields) {
      if (field.hidden || isHasMany(field) || field.name in clean) continue;
      const raw = input[field.name];
      if (raw === "" || raw === null) clean[field.name] = raw;
    }

    return { success: true, data: clean };
  } catch (err) {
    // A malformed rule must never take down the request — see CLAUDE.md.
    console.error("[validateEntityData]", entity.name, err);
    return toFailure([
      { field: "_", message: "Unexpected validation error" },
    ]);
  }
}

/** Shape a list of field errors into a ValidationResult. */
export function toFailure(fieldErrors: FieldError[]): ValidationResult {
  return {
    success: false,
    fieldErrors,
    errors: fieldErrors.map((e) => `${e.field}: ${e.message}`),
  };
}

// ── Internal ──────────────────────────────────────────────────────────────────

/** One message per field — a form shows a single error under each input. */
function zodFieldErrors(error: z.ZodError): FieldError[] {
  const byField = new Map<string, string>();

  for (const issue of error.errors) {
    const field = issue.path.length > 0 ? String(issue.path[0]) : "_";
    if (!byField.has(field)) byField.set(field, issue.message);
  }

  return Array.from(byField, ([field, message]) => ({ field, message }));
}

/** Compile a config-supplied pattern; never throws on a bad one. */
function safeRegExp(source: string): RegExp | null {
  try {
    return new RegExp(source);
  } catch {
    return null;
  }
}

function buildFieldSchema(field: FieldConfig, rules: FieldRules): z.ZodTypeAny {
  const label = fieldLabel(field);
  /** A custom `validation.message` overrides whichever rule fails. */
  const msg = (generated: string) => rules.message ?? generated;

  switch (field.type) {
    case "string":
    case "textarea":
    case "email":
    case "url":
    case "file":
      return withStringRules(
        z.string({ invalid_type_error: msg(`${label} must be text`) }),
        field,
        rules,
        label,
        msg
      );

    case "number": {
      let s = z.coerce.number({
        invalid_type_error: msg(`${label} must be a number`),
      });
      if (rules.min !== undefined) {
        s = s.min(rules.min, msg(`${label} must be at least ${rules.min}`));
      }
      if (rules.max !== undefined) {
        s = s.max(rules.max, msg(`${label} must be at most ${rules.max}`));
      }
      return s;
    }

    case "boolean":
      return z.coerce.boolean();

    case "relation":
      // A belongsTo holds the target record's id. `required` is applied by the
      // caller like any other field, so a missing relation is rejected exactly
      // the way a missing regular field is.
      return z.string({
        invalid_type_error: msg(`${label} must be a record reference`),
      });

    case "date":
      return z
        .string({ invalid_type_error: msg(`${label} must be a date`) })
        .refine(
          (v) => !isNaN(Date.parse(v)),
          msg(`${label} must be a valid date`)
        );

    case "select": {
      if (field.options && field.options.length > 0) {
        const values = field.options.map((o) => o.value) as [string, ...string[]];
        return z.enum(values, {
          errorMap: () => ({
            message: msg(`${label} must be one of: ${values.join(", ")}`),
          }),
        });
      }
      return z.string(); // no options defined — accept any string
    }

    default:
      return z.unknown(); // graceful fallback for unknown types
  }
}

/** minLength / maxLength / regex / email — shared by every string-backed type. */
function withStringRules(
  base: z.ZodString,
  field: FieldConfig,
  rules: FieldRules,
  label: string,
  msg: (generated: string) => string
): z.ZodTypeAny {
  let s = base;

  if (rules.minLength !== undefined) {
    s = s.min(
      rules.minLength,
      msg(`${label} must be at least ${rules.minLength} characters`)
    );
  }
  if (rules.maxLength !== undefined) {
    s = s.max(
      rules.maxLength,
      msg(`${label} must be at most ${rules.maxLength} characters`)
    );
  }
  if (rules.regex) {
    const re = safeRegExp(rules.regex);
    if (re) s = s.regex(re, msg(`${label} has an invalid format`));
  }
  if (rules.email) {
    s = s.email(msg(`${label} must be a valid email`));
  }
  if (field.type === "url") {
    s = s.url(msg(`${label} must be a valid URL`));
  }

  return s;
}
