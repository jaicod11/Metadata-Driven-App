// src/components/runtime/forms/fields/RelationField.tsx
"use client";

import { AppConfig, FieldConfig } from "@/types/config.types";
import { useRuntimeData } from "@/hooks/useRuntimeData";
import { recordLabel, relationTarget } from "@/lib/runtime/relations";
import {
  ActiveRole,
  FULL_ACCESS_ROLE,
  canResolveRelation,
} from "@/lib/runtime/permissions";

interface Props {
  field: FieldConfig;
  value: unknown;
  error?: string;
  onChange: (value: unknown) => void;
  appId?: string;
  config?: AppConfig;
  role?: ActiveRole;
}

const selectClass =
  "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none " +
  "focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white transition-colors";

/**
 * belongsTo input: the target entity's records as a dropdown, storing the
 * chosen record's id. The list is capped at the API's maximum page size.
 */
export function RelationField({
  field,
  value,
  onChange,
  appId,
  config,
  role = FULL_ACCESS_ROLE,
}: Props) {
  const target = config ? relationTarget(field, config.entities) : undefined;
  // Picking a record means reading the target entity — don't ask if the role
  // may not.
  const permitted = Boolean(config && canResolveRelation(config, field, role));

  const { data, isLoading, error } = useRuntimeData(
    permitted ? appId : undefined,
    target?.name,
    { limit: 100 }
  );

  if (!config || !appId || !target || !permitted) {
    return (
      <div className="px-3 py-2 border border-dashed border-amber-300 bg-amber-50 rounded-lg text-sm text-amber-600">
        Relation &quot;{field.name}&quot; points at{" "}
        <span className="font-mono">{field.target ?? "nothing"}</span>, which
        isn&apos;t available here.
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-3 py-2 border border-dashed border-red-300 bg-red-50 rounded-lg text-sm text-red-600">
        Could not load {target.label ?? target.name} records.
      </div>
    );
  }

  const records = data?.records ?? [];
  const selected = value === null || value === undefined ? "" : String(value);

  // An id that is no longer in the fetched page would otherwise reset the input.
  const missingSelection =
    selected !== "" && !records.some((r) => String(r.id) === selected);

  return (
    <>
      <select
        value={selected}
        disabled={isLoading}
        onChange={(e) => onChange(e.target.value)}
        className={selectClass}
      >
        <option value="">
          {isLoading
            ? "Loading…"
            : field.placeholder ??
              `Select ${(target.label ?? target.name).toLowerCase()}…`}
        </option>

        {missingSelection && (
          <option value={selected}>{`#${selected.slice(-6)} (not listed)`}</option>
        )}

        {records.map((record) => (
          <option key={String(record.id)} value={String(record.id)}>
            {recordLabel(record, target, field.displayField)}
          </option>
        ))}
      </select>

      {!isLoading && records.length === 0 && (
        <p className="text-xs text-amber-600 mt-1">
          No {(target.label ?? target.name).toLowerCase()} records yet — create
          one first.
        </p>
      )}
    </>
  );
}
