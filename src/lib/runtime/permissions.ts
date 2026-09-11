// src/lib/runtime/permissions.ts
//
// Who may do what, resolved from the config in one place so the UI and the API
// can never disagree about it.
//
// There is no role column on the user: membership is declared by the config
// (a role lists its users, or is marked `default`), and resolved against the
// signed-in session. Roles govern the generated app — its pages, fields and
// records. They do not govern the config itself: the dashboard and the config
// editor stay owner-only, so an owner can always fix a config that locked
// everyone out.
//
// Defaults, so configs written before roles existed behave exactly as before:
//
//   no "roles" in the config      → full access for everyone
//   entity with no permissions    → open to every declared role
//   role missing from a declared
//     entity permissions map      → no access to that entity
//   verb omitted inside a rule    → denied ({ read: true } is read-only)
//   field with no permissions     → visible and editable
//
// Pure config logic — no database, no React. The client uses it to render; the
// API routes enforce it independently, and never trust the client's copy.

import {
  AppConfig,
  EntityConfig,
  EntityPermissionRule,
  FieldConfig,
  PageConfig,
  RoleConfig,
} from "@/types/config.types";
import { isHasMany, isRelation, relationTarget } from "./relations";

export type PermissionAction = "read" | "create" | "update" | "delete";

export interface EntityPermissions {
  read: boolean;
  create: boolean;
  update: boolean;
  delete: boolean;
}

export interface FieldAccess {
  visible: boolean;
  editable: boolean;
}

/** The role a request or a page render is acting under. */
export interface ActiveRole {
  /**
   * "full" — the config declares no roles, or the caller owns the app and
   *          matches none: everything is permitted.
   * "role" — a declared role, named by `name`.
   * "none" — roles are declared, the caller holds none, and does not own the
   *          app: nothing is permitted.
   */
  kind: "full" | "role" | "none";
  name: string | null;
  label?: string;
}

export const FULL_ACCESS: EntityPermissions = {
  read: true,
  create: true,
  update: true,
  delete: true,
};

export const NO_ACCESS: EntityPermissions = {
  read: false,
  create: false,
  update: false,
  delete: false,
};

/** Access when a config declares no roles at all. */
export const FULL_ACCESS_ROLE: ActiveRole = {
  kind: "full",
  name: null,
  label: "Full access",
};

export const NO_ACCESS_ROLE: ActiveRole = {
  kind: "none",
  name: null,
  label: "No access",
};

export interface SessionUserLike {
  id?: string | null;
  email?: string | null;
  /** Owners fall back to full access rather than being locked out of their app. */
  isOwner?: boolean;
}

export function configRoles(config: AppConfig): RoleConfig[] {
  return config.roles ?? [];
}

function holdsRole(role: RoleConfig, user: SessionUserLike): boolean {
  if (!role.users || role.users.length === 0) return false;

  const email = user.email?.trim().toLowerCase();
  return role.users.some((member) => {
    const value = String(member).trim();
    if (!value) return false;
    if (email && value.toLowerCase() === email) return true;
    return Boolean(user.id) && value === user.id;
  });
}

/**
 * The role a user acts under: the one that lists them, else the default role,
 * else full access if they own the app, else nothing.
 */
export function resolveRole(
  config: AppConfig,
  user: SessionUserLike | null
): ActiveRole {
  const roles = configRoles(config);
  if (roles.length === 0) return FULL_ACCESS_ROLE;
  if (!user) return NO_ACCESS_ROLE;

  const assigned = roles.find((role) => holdsRole(role, user));
  if (assigned) {
    return { kind: "role", name: assigned.name, label: assigned.label };
  }

  const fallback = roles.find((role) => role.default === true);
  if (fallback) {
    return { kind: "role", name: fallback.name, label: fallback.label };
  }

  // A config that declares roles but assigns nobody must not black out the
  // owner's own app.
  return user.isOwner ? FULL_ACCESS_ROLE : NO_ACCESS_ROLE;
}

/** Everything a role may do with one entity. */
export function entityPermissions(
  entity: EntityConfig | undefined,
  role: ActiveRole
): EntityPermissions {
  if (!entity || role.kind === "none") return NO_ACCESS;
  if (role.kind === "full") return FULL_ACCESS;

  // No map on the entity: open to every declared role.
  if (!entity.permissions) return FULL_ACCESS;

  const rule: EntityPermissionRule | undefined = role.name
    ? entity.permissions[role.name]
    : undefined;

  // A map exists but doesn't mention this role: nothing.
  if (!rule) return NO_ACCESS;

  return {
    read: rule.read === true,
    create: rule.create === true,
    update: rule.update === true,
    delete: rule.delete === true,
  };
}

export function can(
  entity: EntityConfig | undefined,
  role: ActiveRole,
  action: PermissionAction
): boolean {
  return entityPermissions(entity, role)[action];
}

/** Whether a role may read the entity named by `name`. */
export function canReadEntity(
  config: AppConfig,
  name: string | undefined,
  role: ActiveRole
): boolean {
  if (!name) return false;
  return can(
    config.entities.find((e) => e.name === name),
    role,
    "read"
  );
}

/** A field's visibility and editability for a role. Both default to true. */
export function fieldAccess(
  entity: EntityConfig | undefined,
  field: FieldConfig,
  role: ActiveRole
): FieldAccess {
  if (role.kind === "none") return { visible: false, editable: false };
  if (role.kind === "full") return { visible: true, editable: true };

  const rule = role.name ? field.permissions?.[role.name] : undefined;
  return {
    visible: rule?.visible !== false,
    editable: rule?.editable !== false,
  };
}

/**
 * The fields a role may see, in config order. Skips config-hidden fields, and
 * relations whose target entity the role cannot read — a belongsTo or hasMany
 * it may not resolve must not be rendered or fetched at all.
 */
export function visibleFields(
  config: AppConfig,
  entity: EntityConfig,
  role: ActiveRole
): FieldConfig[] {
  return entity.fields.filter((field) => {
    if (field.hidden) return false;
    if (!fieldAccess(entity, field, role).visible) return false;
    if (isRelation(field)) return canResolveRelation(config, field, role);
    return true;
  });
}

/** Can this role follow a relation — is its target entity readable? */
export function canResolveRelation(
  config: AppConfig,
  field: FieldConfig,
  role: ActiveRole
): boolean {
  if (!isRelation(field)) return false;
  const target = relationTarget(field, config.entities);
  return Boolean(target) && can(target, role, "read");
}

/** Fields a role may write, given whether this is a create or an update. */
export function writableFields(
  config: AppConfig,
  entity: EntityConfig,
  role: ActiveRole,
  action: "create" | "update"
): FieldConfig[] {
  if (!can(entity, role, action)) return [];
  return visibleFields(config, entity, role).filter(
    (field) => fieldAccess(entity, field, role).editable && !isHasMany(field)
  );
}

/**
 * Strip the fields a role may not see from a stored record. Applied by the API
 * before responding, so a hidden field never reaches the client.
 */
export function readableRecord(
  config: AppConfig,
  entity: EntityConfig,
  role: ActiveRole,
  record: Record<string, unknown>
): Record<string, unknown> {
  const allowed = new Set(visibleFields(config, entity, role).map((f) => f.name));
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(record)) {
    // Record metadata is not a config field and is always returned.
    if (key === "id" || key === "createdAt" || key === "updatedAt") {
      result[key] = value;
      continue;
    }
    if (allowed.has(key)) result[key] = value;
  }

  return result;
}

/**
 * Drop anything the role may not write. Applied after validation, so a client
 * that posts a forbidden field has it discarded rather than rejected.
 */
export function writableData(
  config: AppConfig,
  entity: EntityConfig,
  role: ActiveRole,
  data: Record<string, unknown>,
  action: "create" | "update"
): Record<string, unknown> {
  const allowed = new Set(
    writableFields(config, entity, role, action).map((f) => f.name)
  );
  return Object.fromEntries(
    Object.entries(data).filter(([key]) => allowed.has(key))
  );
}

/** Entities a role may read — what the dashboard and navigation may show. */
export function readableEntities(
  config: AppConfig,
  role: ActiveRole
): EntityConfig[] {
  return config.entities.filter((entity) => can(entity, role, "read"));
}

/**
 * Whether a page may be shown. A page with no entity (a dashboard, say) is
 * always visible; one bound to an entity follows that entity's read permission.
 */
export function canSeePage(
  config: AppConfig,
  page: PageConfig,
  role: ActiveRole
): boolean {
  if (role.kind === "none") return false;
  if (!page.entity) return true;

  const entity = config.entities.find((e) => e.name === page.entity);
  // An undefined entity reference is already a config warning; don't hide it.
  if (!entity) return true;

  return can(entity, role, "read");
}

export function visiblePages(config: AppConfig, role: ActiveRole): PageConfig[] {
  return config.pages.filter((page) => canSeePage(config, page, role));
}
