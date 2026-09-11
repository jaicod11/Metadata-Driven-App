// src/components/runtime/detail/DetailView.tsx
"use client";

import { AppConfig, EntityConfig, FieldConfig, PageConfig } from "@/types/config.types";
import { useRuntimeRecord } from "@/hooks/useRuntimeData";
import { ErrorBoundary } from "../ErrorBoundary";
import { RelationValue } from "../relations/RelationValue";
import { RelatedList } from "../relations/RelatedList";
import { isBelongsTo, isHasMany } from "@/lib/runtime/relations";
import {
  ActiveRole,
  FULL_ACCESS_ROLE,
  can,
  visibleFields,
} from "@/lib/runtime/permissions";

interface Props {
  page: PageConfig;
  entity?: EntityConfig;
  appId: string;
  config: AppConfig;
  /** Trailing URL segment: /runtime/:appId/employees/view/:recordId */
  recordId?: string;
  role?: ActiveRole;
}

/** One record: its stored fields, then a list per hasMany relation. */
export function DetailView({
  entity,
  appId,
  config,
  recordId,
  role = FULL_ACCESS_ROLE,
}: Props) {
  const mayRead = can(entity, role, "read");
  const { record, isLoading, error } = useRuntimeRecord(
    mayRead ? appId : undefined,
    entity?.name,
    recordId
  );

  if (!entity) {
    return (
      <div className="p-4 rounded-lg border border-dashed border-amber-300 bg-amber-50">
        <p className="text-sm text-amber-700">
          No entity configured for this detail page. Add an{" "}
          <code className="font-mono text-xs bg-amber-100 px-1 rounded">entity</code>{" "}
          key to this page in your config.
        </p>
      </div>
    );
  }

  if (!mayRead) {
    return (
      <div className="p-4 rounded-lg border border-dashed border-gray-300 bg-gray-50">
        <p className="text-sm text-gray-600">
          Your role{role.name ? ` ("${role.label ?? role.name}")` : ""} cannot
          view {entity.label ?? entity.name} records.
        </p>
      </div>
    );
  }

  if (!recordId) {
    return (
      <div className="p-4 rounded-lg border border-dashed border-gray-300 bg-gray-50">
        <p className="text-sm text-gray-500">
          Pick a record from the {(entity.label ?? entity.name).toLowerCase()}{" "}
          list — this page expects a record id, e.g.{" "}
          <code className="font-mono text-xs bg-gray-100 px-1 rounded">
            {pathHint(entity)}
          </code>
          .
        </p>
      </div>
    );
  }

  if (isLoading && !record) {
    return <div className="h-40 rounded-xl bg-gray-100 animate-pulse" />;
  }

  if (error || !record) {
    return (
      <div className="p-4 rounded-lg border border-red-200 bg-red-50">
        <p className="text-sm font-medium text-red-700">Record not found</p>
        <p className="text-xs text-red-500 mt-1">
          {error?.message ?? `No ${entity.label ?? entity.name} with id ${recordId}.`}
        </p>
      </div>
    );
  }

  // Both lists are already filtered to what this role may see, including
  // relations whose target entity it may not read.
  const permitted = visibleFields(config, entity, role);
  const storedFields = permitted.filter((f) => !isHasMany(f));
  const hasManyFields = permitted.filter(isHasMany);

  return (
    <ErrorBoundary componentType="detail">
      <div className="space-y-8">
        {/* Fields */}
        <dl className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white overflow-hidden">
          {storedFields.map((field) => (
            <div
              key={field.name}
              className="px-4 py-3 sm:grid sm:grid-cols-3 sm:gap-4"
            >
              <dt className="text-sm font-medium text-gray-500">
                {field.label ?? field.name}
              </dt>
              <dd className="mt-1 sm:mt-0 sm:col-span-2 text-sm text-gray-800 break-words">
                {isBelongsTo(field) ? (
                  <RelationValue
                    value={record[field.name]}
                    field={field}
                    appId={appId}
                    config={config}
                    role={role}
                  />
                ) : (
                  formatValue(record[field.name], field)
                )}
              </dd>
            </div>
          ))}
        </dl>

        {/* One linked list per hasMany relation */}
        {hasManyFields.map((field) => (
          <section key={field.name} className="space-y-2">
            <h3 className="text-sm font-semibold text-gray-700">
              {field.label ?? field.name}
            </h3>
            <ErrorBoundary componentType="relatedList">
              <RelatedList
                appId={appId}
                config={config}
                entity={entity}
                recordId={recordId}
                field={field}
                role={role}
              />
            </ErrorBoundary>
          </section>
        ))}
      </div>
    </ErrorBoundary>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function pathHint(entity: EntityConfig): string {
  return `/${entity.name}/view/<id>`;
}

function formatValue(value: unknown, field: FieldConfig): string {
  if (value === null || value === undefined || value === "") return "—";
  if (field.type === "boolean") return value ? "✓ Yes" : "✗ No";
  if (field.type === "date") {
    const parsed = Date.parse(String(value));
    if (!isNaN(parsed)) {
      return new Date(parsed).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    }
  }
  if (field.type === "select") {
    const option = field.options?.find((o) => o.value === String(value));
    if (option) return option.label;
  }
  return String(value);
}
