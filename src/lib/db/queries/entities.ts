import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

/** Restrict to records whose JSONB `field` equals `value`. */
export interface EntityFilter {
  field: string;
  value: unknown;
}

export interface EntitySort {
  /** JSONB key to sort by; ignored when `column` is set. */
  field?: string;
  direction: "asc" | "desc";
  /** Sort numerically rather than as text — set for number fields. */
  numeric?: boolean;
  /** Sort by a real column instead of a JSONB key. */
  column?: "createdAt" | "updatedAt";
}

export interface EntitySearch {
  term: string;
  /** JSONB keys to match against. An empty list matches nothing. */
  fields: string[];
}

export interface ListOptions {
  page?: number;
  limit?: number;
  orderBy?: "asc" | "desc";
  /** Single filter, kept for callers that only need one (hasMany children). */
  filter?: EntityFilter;
  filters?: EntityFilter[];
  sort?: EntitySort;
  search?: EntitySearch;
}

export const MAX_PAGE_SIZE = 100;

/**
 * Callers are responsible for only passing field names the requester is allowed
 * to read — the API route resolves those from the config and the active role.
 * Nothing here can check permissions.
 *
 * This is raw SQL rather than the query builder for two reasons: Prisma cannot
 * ORDER BY a JSON path at all, and its JSON `path`/`equals` filter compiles to
 * `data#>'{k}' = ...`, which no index can serve. Containment (`@>`) is what the
 * GIN index on app_data.data answers. Every value is a bound parameter,
 * including JSONB keys (`data->>$n::text` is legal — the cast disambiguates the
 * text-key operator from the array-index one), so no caller input is ever
 * interpolated into the statement.
 */
export async function listEntityRecords(
  appId: string,
  entity: string,
  options: ListOptions = {}
) {
  const page = Math.max(1, options.page ?? 1);
  const limit = Math.min(Math.max(1, options.limit ?? 20), MAX_PAGE_SIZE);
  const skip = (page - 1) * limit;

  const where = buildWhere(appId, entity, options);
  const orderBy = buildOrderBy(options);

  type Row = {
    id: string;
    data: unknown;
    createdAt: Date;
    updatedAt: Date;
  };

  const [rows, counted] = await Promise.all([
    prisma.$queryRaw<Row[]>`
      SELECT "id", "data", "createdAt", "updatedAt"
      FROM "app_data"
      WHERE ${where}
      ${orderBy}
      LIMIT ${limit} OFFSET ${skip}
    `,
    // ::int because COUNT() is a bigint, which does not survive JSON encoding.
    prisma.$queryRaw<{ total: number }[]>`
      SELECT COUNT(*)::int AS total FROM "app_data" WHERE ${where}
    `,
  ]);

  const total = Number(counted[0]?.total ?? 0);

  const records = rows.map((r) => ({
    id: r.id,
    ...(r.data as Record<string, unknown>),
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }));

  return {
    records,
    meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  };
}

// ── Query construction ────────────────────────────────────────────────────────

function buildWhere(
  appId: string,
  entity: string,
  options: ListOptions
): Prisma.Sql {
  const conditions: Prisma.Sql[] = [
    Prisma.sql`"appId" = ${appId}`,
    Prisma.sql`"entity" = ${entity}`,
  ];

  const filters = [
    ...(options.filter ? [options.filter] : []),
    ...(options.filters ?? []),
  ];

  for (const filter of filters) {
    if (filter.value === undefined || filter.value === null) continue;
    // Containment, so the GIN index can serve it. Note this compares JSON
    // types: a numeric field wants a number here, not "5".
    const probe = JSON.stringify({ [filter.field]: filter.value });
    conditions.push(Prisma.sql`"data" @> ${probe}::jsonb`);
  }

  const search = options.search;
  if (search && search.term.trim() !== "") {
    if (search.fields.length === 0) {
      // Nothing this caller may search — that is no matches, not no filter.
      conditions.push(Prisma.sql`FALSE`);
    } else {
      const term = `%${escapeLike(search.term.trim())}%`;
      const matches = search.fields.map(
        (field) => Prisma.sql`"data"->>${field}::text ILIKE ${term}`
      );
      conditions.push(Prisma.sql`(${Prisma.join(matches, " OR ")})`);
    }
  }

  return Prisma.join(conditions, " AND ");
}

function buildOrderBy(options: ListOptions): Prisma.Sql {
  const sort = options.sort;
  // Direction is whitelisted here; it is the only part of the statement that is
  // not a bound parameter.
  const direction = Prisma.raw(sort?.direction === "asc" ? "ASC" : "DESC");

  if (sort?.column) {
    const column = Prisma.raw(
      sort.column === "updatedAt" ? `"updatedAt"` : `"createdAt"`
    );
    return Prisma.sql`ORDER BY ${column} ${direction}, "id" ASC`;
  }

  if (sort?.field) {
    const key = sort.field;
    // A stable tiebreaker keeps paging consistent when values repeat.
    if (sort.numeric) {
      // Rows whose value isn't actually a number sort last rather than erroring
      // the whole query on a bad cast.
      return Prisma.sql`
        ORDER BY CASE WHEN jsonb_typeof("data"->${key}::text) = 'number'
                      THEN ("data"->>${key}::text)::numeric END ${direction} NULLS LAST,
                 "createdAt" DESC, "id" ASC
      `;
    }
    return Prisma.sql`
      ORDER BY lower("data"->>${key}::text) ${direction} NULLS LAST,
               "createdAt" DESC, "id" ASC
    `;
  }

  const fallback = Prisma.raw(options.orderBy === "asc" ? "ASC" : "DESC");
  return Prisma.sql`ORDER BY "createdAt" ${fallback}, "id" ASC`;
}

/** So a user's % or _ searches literally instead of wildcarding. */
function escapeLike(term: string): string {
  return term.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

// ─── Summaries ────────────────────────────────────────────────────────────────
//
// Dashboard widgets read through the same WHERE builder as the list route, so a
// widget filter behaves exactly like ?filter.<field>= and is served by the same
// GIN index. Callers are responsible for only naming fields the requester may
// read — src/lib/runtime/widgets.ts decides that.

export interface SummaryOptions {
  filters?: EntityFilter[];
}

/** How many records match. Same WHERE as listEntityRecords, without the page. */
export async function countEntityRecords(
  appId: string,
  entity: string,
  options: SummaryOptions = {}
): Promise<number> {
  const where = buildWhere(appId, entity, options);

  const rows = await prisma.$queryRaw<{ total: number }[]>`
    SELECT COUNT(*)::int AS total FROM "app_data" WHERE ${where}
  `;
  return Number(rows[0]?.total ?? 0);
}

export type AggregateOperation = "sum" | "avg" | "min" | "max";

const AGGREGATE_SQL: Record<AggregateOperation, string> = {
  sum: "SUM",
  avg: "AVG",
  min: "MIN",
  max: "MAX",
};

/**
 * Reduce one numeric JSONB field. Rows whose value is not actually a number are
 * skipped rather than failing the whole query on a bad cast — the same guard
 * the numeric sort uses. Returns null when nothing matched.
 */
export async function aggregateEntityRecords(
  appId: string,
  entity: string,
  options: SummaryOptions & { field: string; op: AggregateOperation }
): Promise<number | null> {
  const where = buildWhere(appId, entity, options);
  // Whitelisted, and the only part of the statement that is not a parameter.
  const fn = Prisma.raw(AGGREGATE_SQL[options.op] ?? "SUM");
  const field = options.field;

  const rows = await prisma.$queryRaw<{ value: number | null }[]>`
    SELECT ${fn}(
             CASE WHEN jsonb_typeof("data"->${field}::text) = 'number'
                  THEN ("data"->>${field}::text)::numeric END
           )::float8 AS value
    FROM "app_data"
    WHERE ${where}
  `;

  const value = rows[0]?.value;
  return value === null || value === undefined ? null : Number(value);
}

export interface GroupCount {
  /** The field's value for this group; null when the record has no value. */
  label: string | null;
  value: number;
}

/** Count records per distinct value of one field — what a chart widget plots. */
export async function groupEntityRecords(
  appId: string,
  entity: string,
  options: SummaryOptions & { field: string; limit?: number }
): Promise<GroupCount[]> {
  const where = buildWhere(appId, entity, options);
  const limit = Math.min(Math.max(1, options.limit ?? 12), 50);
  const field = options.field;

  // GROUP BY / ORDER BY are positional so the grouped expression stays a
  // bound parameter rather than being repeated.
  const rows = await prisma.$queryRaw<{ label: string | null; value: number }[]>`
    SELECT "data"->>${field}::text AS label, COUNT(*)::int AS value
    FROM "app_data"
    WHERE ${where}
    GROUP BY 1
    ORDER BY 2 DESC, 1 ASC
    LIMIT ${limit}
  `;

  return rows.map((row) => ({
    label: row.label === null || row.label === undefined ? null : String(row.label),
    value: Number(row.value),
  }));
}

export async function getEntityRecord(
  appId: string,
  entity: string,
  id: string
) {
  const row = await prisma.appData.findFirst({
    where: { id, appId, entity },
  });
  if (!row) return null;
  return {
    id: row.id,
    ...(row.data as Record<string, unknown>),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function createEntityRecord(
  appId: string,
  entity: string,
  data: Record<string, unknown>
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const row = await prisma.appData.create({
    data: { appId, entity, data: data as any },
  });
  return {
    id: row.id,
    ...(row.data as Record<string, unknown>),
    createdAt: row.createdAt,
  };
}

export async function updateEntityRecord(
  appId: string,
  entity: string,
  id: string,
  patch: Record<string, unknown>
) {
  const existing = await prisma.appData.findFirst({
    where: { id, appId, entity },
  });
  if (!existing) return null;
  const merged = { ...(existing.data as Record<string, unknown>), ...patch };
  const updated = await prisma.appData.update({
    where: { id },
    data: { data: merged as any },
  });
  return {
    id: updated.id,
    ...(updated.data as Record<string, unknown>),
    updatedAt: updated.updatedAt,
  };
}

export async function deleteEntityRecord(
  appId: string,
  entity: string,
  id: string
): Promise<boolean> {
  const existing = await prisma.appData.findFirst({
    where: { id, appId, entity },
  });
  if (!existing) return false;
  await prisma.appData.delete({ where: { id } });
  return true;
}

export async function bulkCreateEntityRecords(
  appId: string,
  entity: string,
  rows: Record<string, unknown>[]
) {
  return prisma.appData.createMany({
    data: rows.map((data) => ({ appId, entity, data: data as any })),
  });
}

/**
 * Finds a record whose JSONB `field` already holds `value` — backs the
 * "unique" validation rule. `excludeId` skips the record being updated.
 */
export async function findRecordByFieldValue(
  appId: string,
  entity: string,
  field: string,
  value: unknown,
  excludeId?: string
) {
  if (value === undefined || value === null || value === "") return null;

  return prisma.appData.findFirst({
    where: {
      appId,
      entity,
      ...(excludeId ? { id: { not: excludeId } } : {}),
      // JSONB path lookup: no column exists for a dynamic field.
      data: { path: [field], equals: value as any },
    },
    select: { id: true },
  });
}
