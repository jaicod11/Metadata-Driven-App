// src/lib/runtime/validator.server.ts
//
// Server-side half of the shared validator. Every rule is defined in
// validator.ts and runs on both client and server; "unique" is the one rule
// that cannot be decided without a query, so it is resolved here — from the
// same FieldRules, with the same message shape.
//
// Route handlers call validateEntityRecord(); nothing else should.

import { EntityConfig } from "@/types/config.types";
import { findRecordByFieldValue } from "@/lib/db/queries/entities";
import {
  FieldError,
  ValidationResult,
  fieldLabel,
  isBlank,
  resolveFieldRules,
  toFailure,
  uniqueRuleFields,
  validateEntityData,
} from "./validator";

export interface UniqueCheckContext {
  appId: string;
  /** Entity name, as stored in AppData.entity. */
  entity: string;
  /** The record being updated — it may keep its own value. */
  excludeId?: string;
}

/**
 * Validate a record the way the form does, then enforce the `unique` rules that
 * only the database can answer. Never throws.
 */
export async function validateEntityRecord(
  data: unknown,
  entity: EntityConfig,
  ctx: UniqueCheckContext
): Promise<ValidationResult> {
  const result = validateEntityData(data, entity);
  if (!result.success || !result.data) return result;

  const uniqueFields = uniqueRuleFields(entity);
  if (uniqueFields.length === 0) return result;

  const conflicts: FieldError[] = [];

  for (const field of uniqueFields) {
    const value = result.data[field.name];
    if (isBlank(value)) continue; // nothing to collide with

    const existing = await findRecordByFieldValue(
      ctx.appId,
      ctx.entity,
      field.name,
      value,
      ctx.excludeId
    );

    if (existing) {
      const rules = resolveFieldRules(field);
      conflicts.push({
        field: field.name,
        message:
          rules.message ??
          `${fieldLabel(field)} must be unique — "${String(value)}" is already taken`,
      });
    }
  }

  return conflicts.length > 0 ? toFailure(conflicts) : result;
}
