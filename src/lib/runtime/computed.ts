// src/lib/runtime/computed.ts
//
// Computed fields: the bridge between a FieldConfig and the expression
// evaluator in expression.ts.
//
// A computed field is derived, never stored. It is skipped by the entity schema
// (so a client cannot post one), dropped from writable data (so it cannot be
// written), and produced fresh whenever a record is rendered or returned.
//
// Config logic only — no database, no React.

import { EntityConfig, FieldConfig } from "@/types/config.types";
import { evaluateExpression, expressionFields } from "./expression";

export function isComputed(field: FieldConfig): boolean {
  return field.type === "computed";
}

/** Sibling fields an expression reads. Empty when it is constant or invalid. */
export function computedDependencies(field: FieldConfig): string[] {
  if (!isComputed(field) || !field.expression) return [];
  return expressionFields(field.expression);
}

/**
 * The value of a computed field for one record. Returns null when the
 * expression is missing or malformed — a broken expression renders blank
 * rather than breaking the row.
 */
export function computeFieldValue(
  field: FieldConfig,
  record: Record<string, unknown> | undefined
): unknown {
  if (!isComputed(field) || !field.expression) return null;
  return evaluateExpression(field.expression, record ?? {});
}

/**
 * Add every computed field in `fields` to a copy of `record`.
 *
 * `record` must be the *stored* record: expressions read the real values even
 * when the caller can only see some of them. Which computed fields are passed
 * in is the caller's decision — permissions.ts only passes those whose inputs
 * the role may see, so a computed value can't leak a hidden field.
 */
export function withComputedValues(
  fields: FieldConfig[],
  record: Record<string, unknown>,
  target: Record<string, unknown> = { ...record }
): Record<string, unknown> {
  for (const field of fields) {
    if (!isComputed(field)) continue;
    target[field.name] = computeFieldValue(field, record);
  }
  return target;
}

/** Computed fields of an entity, in config order. */
export function computedFields(entity: EntityConfig): FieldConfig[] {
  return entity.fields.filter(isComputed);
}
