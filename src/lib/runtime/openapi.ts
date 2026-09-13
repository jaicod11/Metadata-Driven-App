// src/lib/runtime/openapi.ts
//
// Turns an AppConfig into an OpenAPI 3.0 document describing the runtime API
// that same config already generates.
//
// This is documentation, derived from the config — it does not validate, gate
// or execute anything. Every rule it reports is read from the modules that do
// enforce it, so the document cannot drift from behaviour:
//
//   resolveFieldRules()  — required, min/max, lengths, regex (validator.ts)
//   visibleFields()      — what a role may read
//   writableFields()     — what a role may write, per create/update
//
// Field selection follows one rule: a field appears if at least one declared
// role could see it (or any field, when the config declares no roles). The
// document describes the endpoint's whole surface, not one caller's view — the
// API still decides per request what that caller actually gets.

import {
  AppConfig,
  EntityConfig,
  FieldConfig,
  SelectOption,
} from "@/types/config.types";
import {
  ActiveRole,
  FULL_ACCESS_ROLE,
  can,
  configRoles,
  readableStoredFields,
  visibleFields,
  writableFields,
} from "./permissions";
import { resolveFieldRules } from "./validator";
import { isComputed } from "./computed";
import { isHasMany, relationTarget } from "./relations";

/** A JSON Schema fragment. Loose on purpose — this is a serialised document. */
type JsonSchema = Record<string, unknown>;

export interface OpenApiOptions {
  /** The app this document describes; also the default for the path param. */
  appId: string;
  /** Absolute origin, so "Try it out" targets the right host. */
  serverUrl?: string;
}

/** Query params the list route reads that are not per-field. */
const MAX_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 20;

/** Types the list route's ?q= search covers — see SEARCHABLE_TYPES in the route. */
const SEARCHABLE_TYPES = ["string", "textarea", "email", "url", "select"];

// ─── Role fan-out ─────────────────────────────────────────────────────────────

/**
 * The roles the document is written against: every declared role, or a single
 * full-access reader when the config declares none.
 */
function specRoles(config: AppConfig): ActiveRole[] {
  const roles = configRoles(config);
  if (roles.length === 0) return [FULL_ACCESS_ROLE];
  return roles.map((role) => ({
    kind: "role" as const,
    name: role.name,
    label: role.label,
  }));
}

/** Union of per-role field lists, kept in the entity's own field order. */
function unionFields(entity: EntityConfig, lists: FieldConfig[][]): FieldConfig[] {
  const names = new Set<string>();
  for (const list of lists) for (const field of list) names.add(field.name);
  return entity.fields.filter((field) => names.has(field.name));
}

/**
 * Fields that can appear in a response: readable by some role, and actually
 * present on a returned record. hasMany is excluded because it is stored on the
 * child — readableRecord() never emits it.
 */
function readableSpecFields(
  config: AppConfig,
  entity: EntityConfig
): FieldConfig[] {
  const union = unionFields(
    entity,
    specRoles(config).map((role) => visibleFields(config, entity, role))
  );
  return union.filter((field) => !isHasMany(field));
}

/**
 * Fields some role may write. writableFields() already drops computed fields,
 * hasMany, and anything a role may see but not edit.
 */
function writableSpecFields(
  config: AppConfig,
  entity: EntityConfig,
  action: "create" | "update"
): FieldConfig[] {
  return unionFields(
    entity,
    specRoles(config).map((role) => writableFields(config, entity, role, action))
  );
}

/** Stored fields some role may read — what the list route can filter and sort on. */
function queryableSpecFields(
  config: AppConfig,
  entity: EntityConfig
): FieldConfig[] {
  return unionFields(
    entity,
    specRoles(config).map((role) => readableStoredFields(config, entity, role))
  );
}

/** Which declared roles may perform an action, for the operation description. */
function permittedRoles(
  config: AppConfig,
  entity: EntityConfig,
  action: "read" | "create" | "update" | "delete"
): string {
  if (configRoles(config).length === 0) {
    return "No roles are declared, so this is open to any signed-in owner.";
  }
  const allowed = specRoles(config)
    .filter((role) => can(entity, role, action))
    .map((role) => role.name)
    .filter(Boolean);

  return allowed.length > 0
    ? `Roles permitted: ${allowed.join(", ")}.`
    : "No declared role may perform this — it answers 403 for everyone.";
}

// ─── Field → schema ───────────────────────────────────────────────────────────

function describeField(field: FieldConfig): string | undefined {
  const parts: string[] = [];
  if (field.helpText) parts.push(field.helpText);
  if (isComputed(field) && field.expression) {
    parts.push(`Computed at read time from: ${field.expression}`);
  }
  if (field.type === "relation" && field.target) {
    parts.push(`Id of a "${field.target}" record.`);
  }
  if (field.type === "date") {
    parts.push("Any date string Date.parse() accepts; ISO 8601 recommended.");
  }
  if (field.type === "file") {
    parts.push("Stored as a URL or path string.");
  }
  return parts.length > 0 ? parts.join(" ") : undefined;
}

/**
 * One field's JSON Schema, with the constraints the validator actually applies.
 */
export function fieldToSchema(field: FieldConfig): JsonSchema {
  const rules = resolveFieldRules(field);
  const schema: JsonSchema = {};

  switch (field.type) {
    case "number":
      schema.type = "number";
      if (rules.min !== undefined) schema.minimum = rules.min;
      if (rules.max !== undefined) schema.maximum = rules.max;
      break;

    case "boolean":
      schema.type = "boolean";
      break;

    case "date":
      schema.type = "string";
      schema.format = "date-time";
      break;

    case "email":
      schema.type = "string";
      schema.format = "email";
      break;

    case "url":
      schema.type = "string";
      schema.format = "uri";
      break;

    case "select": {
      schema.type = "string";
      const options: SelectOption[] = field.options ?? [];
      // No options means the validator accepts any string — so does the spec.
      if (options.length > 0) schema.enum = options.map((o) => o.value);
      break;
    }

    case "relation":
      schema.type = "string";
      break;

    case "computed":
      // Derived from an expression, so the type depends on the expression.
      // readOnly is the point: it can be returned, never sent.
      schema.readOnly = true;
      schema.nullable = true;
      break;

    default:
      schema.type = "string";
      break;
  }

  if (schema.type === "string") {
    if (rules.minLength !== undefined) schema.minLength = rules.minLength;
    if (rules.maxLength !== undefined) schema.maxLength = rules.maxLength;
    if (rules.regex) schema.pattern = rules.regex;
  }

  const title = field.label ?? field.name;
  if (title !== field.name) schema.title = title;

  const description = describeField(field);
  if (description) schema.description = description;

  if (field.defaultValue !== undefined) schema.default = field.defaultValue;

  return schema;
}

function propertiesOf(fields: FieldConfig[]): JsonSchema {
  return Object.fromEntries(fields.map((f) => [f.name, fieldToSchema(f)]));
}

// ─── Component naming ─────────────────────────────────────────────────────────

/** Component keys allow [A-Za-z0-9._-]; entity names are arbitrary config text. */
function componentBase(entityName: string, taken: Set<string>): string {
  const cleaned = entityName.replace(/[^A-Za-z0-9._-]/g, "") || "Entity";
  const pascal = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);

  let name = pascal;
  let suffix = 2;
  while (taken.has(name)) name = `${pascal}${suffix++}`;
  taken.add(name);
  return name;
}

// ─── Document ─────────────────────────────────────────────────────────────────

export function buildOpenApiSpec(
  config: AppConfig,
  options: OpenApiOptions
): Record<string, unknown> {
  const { appId, serverUrl } = options;

  const schemas: Record<string, JsonSchema> = {
    ApiError: {
      type: "object",
      description: "Uniform error envelope returned by every runtime route.",
      properties: {
        success: { type: "boolean", enum: [false] },
        error: {
          type: "object",
          properties: {
            message: { type: "string" },
            details: {
              nullable: true,
              description:
                "Field-level errors for a 400, config errors for a 422, otherwise null.",
            },
          },
          required: ["message"],
        },
      },
      required: ["success", "error"],
    },
    PaginationMeta: {
      type: "object",
      properties: {
        page: { type: "integer" },
        limit: { type: "integer" },
        total: { type: "integer", description: "Total matching records." },
        totalPages: { type: "integer" },
      },
      required: ["page", "limit", "total", "totalPages"],
    },
  };

  const paths: Record<string, JsonSchema> = {};
  const tags: JsonSchema[] = [];
  const taken = new Set<string>(Object.keys(schemas));

  for (const entity of config.entities) {
    const name = componentBase(entity.name, taken);
    const label = entity.label ?? entity.name;

    const readable = readableSpecFields(config, entity);
    const creatable = writableSpecFields(config, entity, "create");
    const updatable = writableSpecFields(config, entity, "update");
    const queryable = queryableSpecFields(config, entity);

    // ── Schemas ───────────────────────────────────────────────────────────────
    schemas[name] = {
      type: "object",
      description: `A ${label} record as returned by the API.`,
      properties: {
        id: { type: "string", readOnly: true },
        ...propertiesOf(readable),
        createdAt: { type: "string", format: "date-time", readOnly: true },
        updatedAt: { type: "string", format: "date-time", readOnly: true },
      },
    };

    schemas[`${name}CreateInput`] = {
      type: "object",
      description: `Body for creating a ${label}. Fields absent here are either computed, derived from a child record, or not writable by any role.`,
      properties: propertiesOf(creatable),
      required: requiredNames(creatable),
      additionalProperties: false,
    };

    schemas[`${name}UpdateInput`] = {
      type: "object",
      description: `Body for updating a ${label}. The route validates the whole record, so required fields must be present even when unchanged; values are then merged onto the stored record.`,
      properties: propertiesOf(updatable),
      required: requiredNames(updatable),
      additionalProperties: false,
    };

    tags.push({ name: label, description: `Operations on ${label} records.` });

    // ── Path ──────────────────────────────────────────────────────────────────
    const recordEnvelope: JsonSchema = {
      type: "object",
      properties: {
        success: { type: "boolean", enum: [true] },
        data: { $ref: `#/components/schemas/${name}` },
      },
    };

    const listEnvelope: JsonSchema = {
      type: "object",
      properties: {
        success: { type: "boolean", enum: [true] },
        data: {
          type: "object",
          properties: {
            records: {
              type: "array",
              items: { $ref: `#/components/schemas/${name}` },
            },
            meta: { $ref: "#/components/schemas/PaginationMeta" },
          },
        },
      },
    };

    paths[`/api/runtime/{appId}/${entity.name}`] = {
      parameters: [
        {
          name: "appId",
          in: "path",
          required: true,
          description: "The app this entity belongs to.",
          schema: { type: "string", default: appId },
        },
      ],

      get: {
        tags: [label],
        summary: `List ${label} records, or fetch one by id`,
        description: [
          `Without \`id\`, returns a page of records with a total count.`,
          `With \`id\`, returns that single record.`,
          `Fields the caller's role cannot read are stripped from the response, and computed fields are evaluated at read time.`,
          permittedRoles(config, entity, "read"),
        ].join(" "),
        operationId: `list${name}`,
        parameters: listParameters(queryable),
        responses: {
          "200": {
            description: "A page of records, or a single record when ?id was given.",
            content: {
              "application/json": {
                schema: { oneOf: [listEnvelope, recordEnvelope] },
              },
            },
          },
          "400": errorResponse("Unknown or non-readable field named by a filter or sort param."),
          "401": errorResponse("No session."),
          "403": errorResponse("This role may not read these records."),
          "404": errorResponse("App, entity or record not found."),
        },
      },

      post: {
        tags: [label],
        summary: `Create a ${label}`,
        description: [
          `Values for fields this role may not write are discarded after validation rather than rejected.`,
          permittedRoles(config, entity, "create"),
        ].join(" "),
        operationId: `create${name}`,
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: `#/components/schemas/${name}CreateInput` },
            },
          },
        },
        responses: {
          "201": {
            description: "The created record.",
            content: { "application/json": { schema: recordEnvelope } },
          },
          "400": errorResponse("Validation failed; `error.details` lists field errors."),
          "401": errorResponse("No session."),
          "403": errorResponse("This role may not create these records."),
        },
      },

      put: {
        tags: [label],
        summary: `Update a ${label}`,
        description: permittedRoles(config, entity, "update"),
        operationId: `update${name}`,
        parameters: [idParameter(true)],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: `#/components/schemas/${name}UpdateInput` },
            },
          },
        },
        responses: {
          "200": {
            description: "The updated record.",
            content: { "application/json": { schema: recordEnvelope } },
          },
          "400": errorResponse("Validation failed, or ?id was missing."),
          "401": errorResponse("No session."),
          "403": errorResponse("This role may not update these records."),
          "404": errorResponse("Record not found."),
        },
      },

      delete: {
        tags: [label],
        summary: `Delete a ${label}`,
        description: permittedRoles(config, entity, "delete"),
        operationId: `delete${name}`,
        parameters: [idParameter(true)],
        responses: {
          "200": {
            description: "The record was deleted.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean", enum: [true] },
                    data: {
                      type: "object",
                      properties: { deleted: { type: "boolean", enum: [true] } },
                    },
                  },
                },
              },
            },
          },
          "400": errorResponse("?id was missing."),
          "401": errorResponse("No session."),
          "403": errorResponse("This role may not delete these records."),
          "404": errorResponse("Record not found."),
        },
      },
    };
  }

  return {
    openapi: "3.0.3",
    info: {
      title: `${config.name} API`,
      version: config.version ?? "1.0.0",
      description: [
        config.description ?? `REST API generated from the "${config.name}" app config.`,
        "",
        "Generated from the app's JSON config — the same config that drives validation, permissions and storage.",
        "A field appears here if at least one declared role could see it; what any single request returns is still decided per caller.",
      ].join("\n"),
    },
    servers: [{ url: serverUrl ?? "/", description: "This deployment" }],
    tags,
    security: [{ sessionCookie: [] }],
    components: {
      schemas,
      securitySchemes: {
        sessionCookie: {
          type: "apiKey",
          in: "cookie",
          name: "next-auth.session-token",
          description:
            "NextAuth session cookie, set by signing in. On HTTPS the name is __Secure-next-auth.session-token.",
        },
      },
    },
    paths,
  };
}

// ─── Parameter helpers ────────────────────────────────────────────────────────

function requiredNames(fields: FieldConfig[]): string[] {
  return fields.filter((f) => resolveFieldRules(f).required).map((f) => f.name);
}

function idParameter(required: boolean): JsonSchema {
  return {
    name: "id",
    in: "query",
    required,
    description: "Record id.",
    schema: { type: "string" },
  };
}

function listParameters(queryable: FieldConfig[]): JsonSchema[] {
  const searchable = queryable
    .filter((f) => SEARCHABLE_TYPES.includes(f.type))
    .map((f) => f.name);

  const params: JsonSchema[] = [
    idParameter(false),
    {
      name: "page",
      in: "query",
      schema: { type: "integer", minimum: 1, default: 1 },
    },
    {
      name: "limit",
      in: "query",
      schema: {
        type: "integer",
        minimum: 1,
        maximum: MAX_PAGE_SIZE,
        default: DEFAULT_PAGE_SIZE,
      },
    },
    {
      name: "sort",
      in: "query",
      description: "Field to order by. Only role-readable stored fields qualify.",
      schema: {
        type: "string",
        enum: [...queryable.map((f) => f.name), "createdAt", "updatedAt"],
      },
    },
    {
      name: "dir",
      in: "query",
      schema: { type: "string", enum: ["asc", "desc"], default: "desc" },
    },
    {
      name: "q",
      in: "query",
      description:
        searchable.length > 0
          ? `Text search across: ${searchable.join(", ")}.`
          : "Text search. This entity has no searchable text fields, so any term matches nothing.",
      schema: { type: "string" },
    },
  ];

  // One exact-match filter per queryable field.
  for (const field of queryable) {
    const schema = fieldToSchema(field);
    delete schema.default;
    params.push({
      name: `filter.${field.name}`,
      in: "query",
      description: `Exact match on ${field.label ?? field.name}.`,
      schema,
    });
  }

  params.push(
    {
      name: "filterField",
      in: "query",
      description:
        "Single-filter form, paired with filterValue. Equivalent to filter.<field>; used by hasMany lists.",
      schema: { type: "string" },
    },
    {
      name: "filterValue",
      in: "query",
      schema: { type: "string" },
    }
  );

  return params;
}

function errorResponse(description: string): JsonSchema {
  return {
    description,
    content: {
      "application/json": { schema: { $ref: "#/components/schemas/ApiError" } },
    },
  };
}
