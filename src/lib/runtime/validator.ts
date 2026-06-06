// src/lib/runtime/validator.ts
//
// Dynamically builds a Zod schema from an EntityConfig,
// then validates incoming request body data against it.

import { z } from "zod";
import { EntityConfig, FieldConfig } from "@/types/config.types";

export interface ValidationResult {
  success: boolean;
  data?: Record<string, unknown>;
  errors?: string[];
}

/** Build a Zod schema from an EntityConfig at runtime */
export function buildEntitySchema(entity: EntityConfig): z.ZodObject<any> {
  const shape: Record<string, z.ZodTypeAny> = {};

  for (const field of entity.fields) {
    if (field.hidden) continue; // hidden fields are ignored on input

    let schema = buildFieldSchema(field);

    if (!field.required) {
      schema = schema.optional();
    }

    shape[field.name] = schema;
  }

  return z.object(shape);
}

/** Validate data against an entity's schema */
export function validateEntityData(
  data: unknown,
  entity: EntityConfig
): ValidationResult {
  try {
    const schema = buildEntitySchema(entity);
    const parsed = schema.parse(data);
    return { success: true, data: parsed };
  } catch (err) {
    if (err instanceof z.ZodError) {
      const errors = err.errors.map(
        (e) => `${e.path.join(".") || "root"}: ${e.message}`
      );
      return { success: false, errors };
    }
    return { success: false, errors: ["Unexpected validation error"] };
  }
}

// ── Internal ──────────────────────────────────────────────────────────────────

function buildFieldSchema(field: FieldConfig): z.ZodTypeAny {
  const { validation } = field;

  switch (field.type) {
    case "string":
    case "textarea": {
      let s = z.string();
      if (validation?.minLength) s = s.min(validation.minLength);
      if (validation?.maxLength) s = s.max(validation.maxLength);
      if (validation?.pattern)   s = s.regex(new RegExp(validation.pattern));
      return s;
    }

    case "email":
      return z.string().email(`${field.label ?? field.name} must be a valid email`);

    case "url":
      return z.string().url(`${field.label ?? field.name} must be a valid URL`);

    case "number": {
      let s = z.number({ coerce: true });
      if (validation?.min !== undefined) s = s.min(validation.min);
      if (validation?.max !== undefined) s = s.max(validation.max);
      return s;
    }

    case "boolean":
      return z.boolean({ coerce: true });

    case "date":
      return z.string().refine(
        (v) => !isNaN(Date.parse(v)),
        `${field.label ?? field.name} must be a valid date`
      );

    case "select": {
      if (field.options && field.options.length > 0) {
        const values = field.options.map((o) => o.value) as [string, ...string[]];
        return z.enum(values);
      }
      return z.string(); // no options defined — accept any string
    }

    case "file":
      return z.string(); // stored as URL/path string

    default:
      return z.unknown(); // graceful fallback for unknown types
  }
}
