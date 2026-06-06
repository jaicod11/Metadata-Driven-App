// src/components/runtime/layouts/TabsLayout.tsx
"use client";

import { useState } from "react";
import { AppConfig, EntityConfig, PageConfig } from "@/types/config.types";
import { getComponent } from "../ComponentRegistry";
import { ErrorBoundary } from "../ErrorBoundary";

interface Props { page: PageConfig; entity?: EntityConfig; appId: string; config: AppConfig; }

export function TabsLayout({ page, entity, appId, config }: Props) {
  const components = page.components ?? [];
  const [activeTab, setActiveTab] = useState(0);

  if (components.length === 0) {
    return <p className="text-sm text-gray-400">No tabs defined for this layout.</p>;
  }

  const active = components[activeTab];
  const Comp = getComponent(active.type);
  const compEntity = active.entity
    ? config.entities.find((e) => e.name === active.entity) ?? entity
    : entity;

  return (
    <div>
      {/* Tab bar */}
      <div className="flex border-b border-gray-200 mb-6 gap-1">
        {components.map((comp, i) => (
          <button
            key={i}
            onClick={() => setActiveTab(i)}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
              activeTab === i
                ? "bg-white border border-gray-200 border-b-white text-blue-600 -mb-px"
                : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
            }`}
          >
            {comp.title ?? comp.type}
          </button>
        ))}
      </div>

      {/* Active tab content */}
      <ErrorBoundary componentType={active.type}>
        <Comp page={page} entity={compEntity} appId={appId} config={config} {...(active.props ?? {})} />
      </ErrorBoundary>
    </div>
  );
}
