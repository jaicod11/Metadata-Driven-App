// src/components/runtime/relations/RelationValue.tsx
"use client";

import Link from "next/link";
import { AppConfig, FieldConfig } from "@/types/config.types";
import { useRuntimeData } from "@/hooks/useRuntimeData";
import {
  detailHref,
  findDetailPage,
  recordLabel,
  relationTarget,
} from "@/lib/runtime/relations";

interface Props {
  /** The stored value of a belongsTo field: the target record's id. */
  value: unknown;
  field: FieldConfig;
  appId: string;
  config: AppConfig;
}

/**
 * Renders a stored relation id as the target record's label, linked to its
 * detail page when the config defines one.
 *
 * Every instance shares one SWR key per target entity, so a table column of
 * these costs a single request rather than one per row.
 */
export function RelationValue({ value, field, appId, config }: Props) {
  const target = relationTarget(field, config.entities);
  const { data, isLoading } = useRuntimeData(appId, target?.name, {
    limit: 100,
  });

  if (!target) return <span className="text-gray-400">—</span>;
  if (value === null || value === undefined || value === "") {
    return <span className="text-gray-400">—</span>;
  }

  const id = String(value);
  const record = data?.records?.find((r) => String(r.id) === id);

  if (isLoading && !record) {
    return <span className="text-gray-300">…</span>;
  }
  if (!record) {
    // The referenced record was deleted, or sits past the first page.
    return (
      <span className="text-gray-400" title={id}>
        #{id.slice(-6)}
      </span>
    );
  }

  const label = recordLabel(record, target, field.displayField);
  const detail = findDetailPage(config, target.name);

  if (!detail) return <span>{label}</span>;

  return (
    <Link
      href={detailHref(appId, detail, id)}
      className="text-blue-600 hover:text-blue-800 hover:underline"
    >
      {label}
    </Link>
  );
}
