// src/components/runtime/dashboards/DashboardWidgets.tsx
"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AppConfig, PageConfig } from "@/types/config.types";
import { WidgetResult, useDashboardWidgets } from "@/hooks/useRuntimeData";
import { StatCard } from "./StatCard";
import { ActiveRole } from "@/lib/runtime/permissions";
import { visibleWidgets } from "@/lib/runtime/widgets";

interface Props {
  page: PageConfig;
  appId: string;
  config: AppConfig;
  role: ActiveRole;
}

/**
 * The widgets declared on a dashboard page.
 *
 * Only what the API returns is rendered — it recomputes permissions per request
 * and omits anything this role may not see. visibleWidgets() is used here only
 * to size the loading placeholders, so the layout does not jump; both sides read
 * the same rule, so they agree.
 */
export function DashboardWidgets({ page, appId, config, role }: Props) {
  const expected = visibleWidgets(config, page, role);
  const { widgets, isLoading, error } = useDashboardWidgets(
    appId,
    page.path,
    expected.length > 0
  );

  if (expected.length === 0) return null;

  if (error) {
    return (
      <div className="p-4 rounded-lg border border-red-200 bg-red-50">
        <p className="text-sm font-medium text-red-700">Failed to load widgets</p>
        <p className="text-xs text-red-500 mt-1">{error.message}</p>
      </div>
    );
  }

  if (isLoading && !widgets) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {expected.map(({ index }) => (
          <div
            key={index}
            className="h-28 rounded-xl border border-gray-200 bg-gray-50 animate-pulse"
          />
        ))}
      </div>
    );
  }

  const results = widgets ?? [];
  if (results.length === 0) return null;

  const tiles = results.filter((w) => w.type !== "chart");
  const charts = results.filter((w) => w.type === "chart");

  return (
    <div className="space-y-6">
      {tiles.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {tiles.map((widget) => (
            <StatCard
              key={widget.index}
              title={widget.title}
              value={formatValue(widget)}
              subtitle={subtitleFor(widget)}
            />
          ))}
        </div>
      )}

      {charts.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {charts.map((widget) => (
            <ChartWidget key={widget.index} widget={widget} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function ChartWidget({ widget }: { widget: WidgetResult }) {
  const points = (widget.points ?? []).map((p) => ({
    label: p.label === null || p.label === "" ? "—" : p.label,
    value: p.value,
  }));

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
      <p className="text-sm font-medium text-gray-500 truncate">{widget.title}</p>

      {points.length === 0 ? (
        <p className="text-sm text-gray-400 mt-8 text-center">No records yet</p>
      ) : (
        <div className="mt-4 h-64">
          <ResponsiveContainer width="100%" height="100%">
            {widget.chart === "line" ? (
              <LineChart data={points}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="#2563eb"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
              </LineChart>
            ) : (
              <BarChart data={points}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="value" fill="#2563eb" radius={[4, 4, 0, 0]} />
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatValue(widget: WidgetResult): string {
  const value = widget.value;
  if (value === null || value === undefined) return "—";

  // Averages rarely land on a whole number; counts and sums usually do.
  const rounded =
    Number.isInteger(value) ? value : Math.round(value * 100) / 100;
  return rounded.toLocaleString();
}

function subtitleFor(widget: WidgetResult): string | undefined {
  if (widget.type === "count") return "matching records";
  if (widget.type === "aggregate" && widget.field) {
    return `${widget.op ?? "sum"} of ${widget.field}`;
  }
  return undefined;
}
