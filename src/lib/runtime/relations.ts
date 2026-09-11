// src/lib/runtime/relations.ts
//
// Everything the runtime needs to interpret a "relation" field, in one place so
// the form, the table, the detail view and the config parser all agree.
//
// A belongsTo field stores the target record's id in the parent's JSONB data.
// A hasMany field stores nothing: it is the inverse view of a belongsTo field
// on the target entity, resolved by findInverseField() and queried by id.
//
// Pure config logic — no database, no React — so it is safe on both sides.

import {
  AppConfig,
  EntityConfig,
  FieldConfig,
  FieldType,
  PageConfig,
  RelationType,
} from "@/types/config.types";

/** Types whose value reads as a label. */
const TEXTUAL_TYPES: FieldType[] = ["string", "textarea", "email", "url"];

export function isRelation(field: FieldConfig): boolean {
  return field.type === "relation";
}

/** "belongsTo" | "hasMany" for a relation field, null for anything else. */
export function relationKind(field: FieldConfig): RelationType | null {
  if (!isRelation(field)) return null;
  return field.relationType === "hasMany" ? "hasMany" : "belongsTo";
}

export function isBelongsTo(field: FieldConfig): boolean {
  return relationKind(field) === "belongsTo";
}

export function isHasMany(field: FieldConfig): boolean {
  return relationKind(field) === "hasMany";
}

/**
 * Does this field hold a value on the record? hasMany is virtual — it has no
 * stored value, so forms, tables and the validator all skip it.
 */
export function isStoredField(field: FieldConfig): boolean {
  return !isHasMany(field);
}

export function findEntity(
  entities: EntityConfig[],
  name: string | undefined
): EntityConfig | undefined {
  if (!name) return undefined;
  return entities.find((e) => e.name === name);
}

/** The entity a relation field points at, if the config defines it. */
export function relationTarget(
  field: FieldConfig,
  entities: EntityConfig[]
): EntityConfig | undefined {
  if (!isRelation(field)) return undefined;
  return findEntity(entities, field.target);
}

/**
 * Which field of the target entity to show as its label: the one the config
 * names, else its first text field, else its first stored field.
 */
export function resolveDisplayField(
  target: EntityConfig,
  preferred?: string
): string | null {
  if (preferred && target.fields.some((f) => f.name === preferred)) {
    return preferred;
  }
  const textual = target.fields.find(
    (f) => !f.hidden && TEXTUAL_TYPES.includes(f.type)
  );
  if (textual) return textual.name;

  const anyStored = target.fields.find((f) => !f.hidden && isStoredField(f));
  return anyStored?.name ?? null;
}

/** A short, human-readable stand-in for a record of `target`. */
export function recordLabel(
  record: Record<string, unknown> | undefined,
  target: EntityConfig,
  preferred?: string
): string {
  if (!record) return "—";

  const key = resolveDisplayField(target, preferred);
  const value = key ? record[key] : undefined;

  if (value !== undefined && value !== null && value !== "") {
    return String(value);
  }
  // No usable label — fall back to a recognisable slice of the id.
  const id = typeof record.id === "string" ? record.id : "";
  return id ? `#${id.slice(-6)}` : "—";
}

/**
 * For a hasMany field on `parent`, the belongsTo field of the target entity
 * that points back at the parent — named by `foreignKey`, or inferred when
 * exactly that relation exists.
 */
export function findInverseField(
  parent: EntityConfig,
  target: EntityConfig,
  field: FieldConfig
): FieldConfig | undefined {
  if (field.foreignKey) {
    return target.fields.find((f) => f.name === field.foreignKey);
  }
  return target.fields.find(
    (f) => isBelongsTo(f) && f.target === parent.name
  );
}

/** The page that renders a single record of `entityName`, if the config has one. */
export function findDetailPage(
  config: AppConfig,
  entityName: string | undefined
): PageConfig | undefined {
  if (!entityName) return undefined;
  return config.pages.find(
    (p) => p.layout === "detail" && p.entity === entityName
  );
}

/** URL of a record's detail page — detail pages take the id as a trailing segment. */
export function detailHref(
  appId: string,
  page: PageConfig,
  recordId: string
): string {
  const base = page.path.replace(/\/$/, "");
  return `/runtime/${appId}${base}/${recordId}`;
}
