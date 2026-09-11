// src/components/runtime/relations/RelatedList.tsx
"use client";

import Link from "next/link";
import { AppConfig, EntityConfig, FieldConfig, PageConfig } from "@/types/config.types";
import { useRuntimeData } from "@/hooks/useRuntimeData";
import {
  detailHref,
  findDetailPage,
  findInverseField,
  isHasMany,
  recordLabel,
  relationTarget,
} from "@/lib/runtime/relations";
import {
  ActiveRole,
  FULL_ACCESS_ROLE,
  can,
  canResolveRelation,
  fieldAccess,
} from "@/lib/runtime/permissions";

interface Props {
  appId: string;
  config: AppConfig;
  /** The parent entity — the side that declares the hasMany field. */
  entity?: EntityConfig;
  /** The parent record whose children to list. */
  recordId?: string;
  /** Which hasMany field to render; the first one when omitted. */
  field?: FieldConfig | string;
  page?: PageConfig;
  role?: ActiveRole;
}

/**
 * The hasMany side of a relation: the target entity's records that point back
 * at this one, each linked to its detail page.
 *
 * Registered as "relatedList", so a config can also place it directly:
 *   { "type": "relatedList", "props": { "field": "employees" } }
 */
export function RelatedList({
  appId,
  config,
  entity,
  recordId,
  field,
  role = FULL_ACCESS_ROLE,
}: Props) {
  const relation = resolveField(entity, field);
  const target = relation ? relationTarget(relation, config.entities) : undefined;

  // A relation this role may not see, or whose target it may not read, is not
  // resolved and not fetched.
  const permitted = Boolean(
    relation &&
      entity &&
      fieldAccess(entity, relation, role).visible &&
      canResolveRelation(config, relation, role) &&
      can(target, role, "read")
  );
  const inverse =
    entity && target && relation
      ? findInverseField(entity, target, relation)
      : undefined;

  const { data, isLoading, error } = useRuntimeData(
    permitted ? appId : undefined,
    target?.name,
    {
      limit: 50,
      filterField: inverse?.name,
      filterValue: recordId,
    }
  );

  if (!entity || !relation || !target) {
    return (
      <p className="text-sm text-gray-400">
        No hasMany relation to show here.
      </p>
    );
  }

  if (!permitted) {
    return (
      <p className="text-sm text-gray-400">
        Not available to your role.
      </p>
    );
  }

  if (!inverse) {
    // Warned about at config load; nothing can be queried without it.
    return (
      <p className="text-sm text-amber-600">
        No field of {target.label ?? target.name} points back at{" "}
        {entity.label ?? entity.name}, so its records can&apos;t be listed.
      </p>
    );
  }

  if (!recordId) {
    return <p className="text-sm text-gray-400">Open a record to see its {relation.label ?? relation.name}.</p>;
  }

  if (isLoading && !data) {
    return <p className="text-sm text-gray-400">Loading…</p>;
  }

  if (error) {
    return (
      <p className="text-sm text-red-600">
        Failed to load {target.label ?? target.name} records.
      </p>
    );
  }

  const records = data?.records ?? [];
  if (records.length === 0) {
    return (
      <p className="text-sm text-gray-400">
        No {(target.label ?? target.name).toLowerCase()} records linked yet.
      </p>
    );
  }

  const detail = findDetailPage(config, target.name);

  return (
    <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200 overflow-hidden">
      {records.map((record) => {
        const id = String(record.id);
        const label = recordLabel(record, target, relation.displayField);

        return (
          <li key={id} className="px-4 py-2.5 text-sm hover:bg-gray-50 transition-colors">
            {detail ? (
              <Link
                href={detailHref(appId, detail, id)}
                className="text-blue-600 hover:text-blue-800 hover:underline"
              >
                {label}
              </Link>
            ) : (
              <span className="text-gray-700">{label}</span>
            )}
          </li>
        );
      })}

      {data?.meta && data.meta.total > records.length && (
        <li className="px-4 py-2 text-xs text-gray-400 bg-gray-50">
          Showing {records.length} of {data.meta.total}
        </li>
      )}
    </ul>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function resolveField(
  entity: EntityConfig | undefined,
  field: FieldConfig | string | undefined
): FieldConfig | undefined {
  if (!entity) return undefined;
  if (field && typeof field === "object") return field;
  if (typeof field === "string") {
    return entity.fields.find((f) => f.name === field && isHasMany(f));
  }
  return entity.fields.find(isHasMany);
}
