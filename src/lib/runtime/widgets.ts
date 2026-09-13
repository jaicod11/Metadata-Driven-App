// src/lib/runtime/widgets.ts
//
// Which dashboard widgets a role may see.
//
// A widget is a summary of records, so it answers to the same gate the records
// do: the entity must be readable, and every field the widget names — the one
// it reduces or groups by, and every field it filters on — must be readable
// too. Otherwise a count with a filter, or a chart's group labels, would report
// values the role cannot read directly.
//
// A widget that fails the check is omitted, never greyed out: a placeholder
// saying "restricted" still tells you the widget exists and, worse, that it has
// something to show. Hidden fields are dropped the same way.
//
// Config logic only — no database, no React. The API recomputes this per
// request; the client uses it to lay out placeholders.

import { AppConfig, EntityConfig, PageConfig, WidgetConfig } from "@/types/config.types";
import { ActiveRole, can, readableStoredFields } from "./permissions";

export interface ResolvedWidget {
  /** Position in page.widgets — how the client and the API refer to the same tile. */
  index: number;
  widget: WidgetConfig;
  entity: EntityConfig;
}

/** Fields a widget names, all of which must be readable for it to render. */
export function widgetFieldNames(widget: WidgetConfig): string[] {
  const names: string[] = [];
  if (widget.type !== "count" && widget.field) names.push(widget.field);
  for (const key of Object.keys(widget.filter ?? {})) names.push(key);
  return names;
}

/**
 * Whether this role may see a widget at all. Returns the entity when it may, so
 * callers don't look it up twice.
 */
export function resolveWidget(
  config: AppConfig,
  widget: WidgetConfig,
  role: ActiveRole
): EntityConfig | null {
  const entity = config.entities.find((e) => e.name === widget.entity);
  if (!entity) return null;
  if (!can(entity, role, "read")) return null;

  // Readable *stored* fields: computed and hasMany are rejected at config load,
  // but a field this role cannot see is a per-request decision.
  const readable = new Set(
    readableStoredFields(config, entity, role).map((f) => f.name)
  );
  for (const name of widgetFieldNames(widget)) {
    if (!readable.has(name)) return null;
  }

  // An aggregate over a non-number field is a config error; refuse it here too
  // rather than asking the database to sum text.
  if (widget.type === "aggregate") {
    const field = entity.fields.find((f) => f.name === widget.field);
    if (!field || field.type !== "number") return null;
  }

  return entity;
}

/** The widgets on a page this role may see, in config order. */
export function visibleWidgets(
  config: AppConfig,
  page: PageConfig,
  role: ActiveRole
): ResolvedWidget[] {
  const widgets = page.widgets ?? [];
  const resolved: ResolvedWidget[] = [];

  widgets.forEach((widget, index) => {
    const entity = resolveWidget(config, widget, role);
    if (entity) resolved.push({ index, widget, entity });
  });

  return resolved;
}

/** A widget's heading, falling back to something readable. */
export function widgetTitle(widget: WidgetConfig, entity: EntityConfig): string {
  if (widget.title) return widget.title;

  const label = entity.label ?? entity.name;
  if (widget.type === "count") return `${label} count`;
  if (widget.type === "aggregate") {
    return `${(widget.op ?? "sum").toUpperCase()} of ${widget.field} — ${label}`;
  }
  return `${label} by ${widget.field}`;
}
