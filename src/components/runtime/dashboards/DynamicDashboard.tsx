// src/components/runtime/dashboards/DynamicDashboard.tsx
"use client";

import { AppConfig, EntityConfig, PageConfig } from "@/types/config.types";
import { useRuntimeData } from "@/hooks/useRuntimeData";
import { StatCard } from "./StatCard";

interface Props {
  page: PageConfig;
  entity?: EntityConfig;
  appId: string;
  config: AppConfig;
}

export function DynamicDashboard({ config, appId }: Props) {
  return (
    <div className="space-y-8">
      {/* Stats row — one card per entity */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {config.entities.map((entity) => (
          <EntityStatCard
            key={entity.name}
            appId={appId}
            entity={entity}
          />
        ))}
      </div>

      {/* Entity summary tables */}
      <div className="space-y-6">
        {config.entities.map((entity) => (
          <EntityRecentTable
            key={entity.name}
            appId={appId}
            entity={entity}
          />
        ))}
      </div>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function EntityStatCard({
  appId,
  entity,
}: {
  appId: string;
  entity: EntityConfig;
}) {
  const { data, isLoading } = useRuntimeData(appId, entity.name, { limit: 1 });

  return (
    <StatCard
      title={entity.label ?? entity.name}
      value={isLoading ? "…" : (data?.meta?.total ?? 0)}
      subtitle={`total ${(entity.label ?? entity.name).toLowerCase()} records`}
    />
  );
}

function EntityRecentTable({
  appId,
  entity,
}: {
  appId: string;
  entity: EntityConfig;
}) {
  const { data, isLoading } = useRuntimeData(appId, entity.name, {
    limit: 5,
  });

  const visibleFields = entity.fields.filter((f) => !f.hidden).slice(0, 4);
  const records: Record<string, unknown>[] = data?.records ?? [];

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
        <h3 className="font-medium text-gray-900">
          Recent {entity.label ?? entity.name}
        </h3>
        <span className="text-xs text-gray-400">Last 5</span>
      </div>

      {isLoading ? (
        <div className="p-5 text-sm text-gray-400 animate-pulse">Loading…</div>
      ) : records.length === 0 ? (
        <div className="p-5 text-sm text-gray-400 text-center">
          No records yet
        </div>
      ) : (
        <table className="min-w-full text-sm divide-y divide-gray-100">
          <thead className="bg-gray-50">
            <tr>
              {visibleFields.map((f) => (
                <th
                  key={f.name}
                  className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide"
                >
                  {f.label ?? f.name}
                </th>
              ))}
              <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Created
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {records.map((r) => (
              <tr key={String(r.id)} className="hover:bg-gray-50">
                {visibleFields.map((f) => (
                  <td
                    key={f.name}
                    className="px-4 py-2 text-gray-700 max-w-[160px] truncate"
                  >
                    {r[f.name] !== null && r[f.name] !== undefined
                      ? String(r[f.name])
                      : "—"}
                  </td>
                ))}
                <td className="px-4 py-2 text-gray-400 text-xs">
                  {r.createdAt
                    ? new Date(String(r.createdAt)).toLocaleDateString()
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
