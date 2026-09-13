// src/lib/runtime/audit.ts
//
// What a mutation is allowed to say about itself.
//
// An audit trail is a second read path over the same data, so it answers to the
// same field-level rules. Two constraints shape everything here:
//
//   Only raw stored fields. A computed field has no value in AppData — it is
//   derived in readableRecord() at read time — so there is nothing to log, and
//   logging a derived value would expose the fields it reads. hasMany is
//   likewise stored on the child, not here.
//
//   Only fields the acting role could read. Otherwise "salary changed from X to
//   Y" becomes a way to read salary without permission to read salary. A field
//   the role can't see is omitted entirely — not even its name — because
//   recording that it changed still leaks something about it.
//
// Both come from readableStoredFields(), the same gate the list route filters
// and sorts by.
//
// Consequence worth knowing: a diff records what the *actor* could see, so an
// admin's edit logs more than a clerk's edit of the same record. Entries are
// filtered again on read against the *viewer's* role, so a narrower viewer can
// never see more through the log than through the record.

import { AppConfig, EntityConfig } from "@/types/config.types";
import { ActiveRole, readableStoredFields } from "./permissions";

export type AuditAction = "create" | "update" | "delete";

export interface AuditFieldChange {
  from: unknown;
  to: unknown;
}

/**
 * Keyed by field name in both shapes, which is what makes redaction uniform:
 *   create / delete → { fields: { name: "Ada" } }              the record as stored
 *   update          → { fields: { name: { from, to } } }       changed fields only
 */
export interface AuditDiff {
  fields: Record<string, unknown>;
}

export const EMPTY_DIFF: AuditDiff = { fields: {} };

/** Names of the stored fields this role may see — the audit allow-list. */
export function auditableFieldNames(
  config: AppConfig,
  entity: EntityConfig,
  role: ActiveRole
): string[] {
  return readableStoredFields(config, entity, role).map((field) => field.name);
}

/** Blank and missing count as the same "no value" — clearing twice isn't a change. */
function sameValue(a: unknown, b: unknown): boolean {
  const aBlank = a === undefined || a === null;
  const bBlank = b === undefined || b === null;
  if (aBlank || bBlank) return aBlank && bBlank;
  return JSON.stringify(a) === JSON.stringify(b);
}

function pick(
  record: Record<string, unknown> | null | undefined,
  names: string[]
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!record) return out;
  for (const name of names) {
    if (record[name] !== undefined) out[name] = record[name];
  }
  return out;
}

/**
 * Build the diff for a mutation that has already happened. `before` and `after`
 * are flattened records ({ id, ...data, createdAt }); only config field names
 * are read from them, so id and the timestamps never end up in the diff.
 */
export function buildAuditDiff(
  config: AppConfig,
  entity: EntityConfig,
  role: ActiveRole,
  action: AuditAction,
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null
): AuditDiff {
  const names = auditableFieldNames(config, entity, role);

  if (action === "create") return { fields: pick(after, names) };
  if (action === "delete") return { fields: pick(before, names) };

  const changes: Record<string, AuditFieldChange> = {};
  for (const name of names) {
    const from = before?.[name];
    const to = after?.[name];
    if (sameValue(from, to)) continue;
    changes[name] = { from: from ?? null, to: to ?? null };
  }
  return { fields: changes };
}

/**
 * Narrow a stored diff to what the reader may see. The writer's role decided
 * what was recorded; this applies the reader's role on top, so an entry written
 * by an admin cannot show a clerk a field the clerk can't read.
 */
export function redactAuditDiff(diff: unknown, allowed: string[]): AuditDiff {
  const permitted = new Set(allowed);
  const fields =
    diff && typeof diff === "object" && !Array.isArray(diff)
      ? (diff as { fields?: unknown }).fields
      : undefined;

  if (!fields || typeof fields !== "object" || Array.isArray(fields)) {
    return EMPTY_DIFF;
  }

  return {
    fields: Object.fromEntries(
      Object.entries(fields as Record<string, unknown>).filter(([name]) =>
        permitted.has(name)
      )
    ),
  };
}

/** Type guard for rendering an update entry's per-field { from, to }. */
export function isFieldChange(value: unknown): value is AuditFieldChange {
  return (
    !!value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    "from" in value &&
    "to" in value
  );
}
