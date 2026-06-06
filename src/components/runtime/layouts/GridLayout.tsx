// src/components/runtime/layouts/GridLayout.tsx
"use client";
import { AppConfig, EntityConfig, PageConfig } from "@/types/config.types";
import { getComponent } from "../ComponentRegistry";
import { ErrorBoundary } from "../ErrorBoundary";

interface Props { page: PageConfig; entity?: EntityConfig; appId: string; config: AppConfig; }

export function GridLayout({ page, entity, appId, config }: Props) {
  const components = page.components ?? [];
  if (components.length === 0) {
    return <p className="text-sm text-gray-400">No components defined for this grid layout.</p>;
  }
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {components.map((comp, i) => {
        const Comp = getComponent(comp.type);
        const compEntity = comp.entity
          ? config.entities.find((e) => e.name === comp.entity) ?? entity
          : entity;
        return (
          <ErrorBoundary key={i} componentType={comp.type}>
            <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
              {comp.title && <h3 className="text-sm font-semibold text-gray-700 mb-3">{comp.title}</h3>}
              <Comp page={page} entity={compEntity} appId={appId} config={config} {...(comp.props ?? {})} />
            </div>
          </ErrorBoundary>
        );
      })}
    </div>
  );
}
