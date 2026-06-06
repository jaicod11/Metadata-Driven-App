// src/components/runtime/dashboards/StatCard.tsx
"use client";

interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  trend?: "up" | "down" | "neutral";
}

export function StatCard({ title, value, subtitle, trend }: StatCardProps) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
      <p className="text-sm font-medium text-gray-500 truncate">{title}</p>
      <p className="text-3xl font-bold text-gray-900 mt-1">{value}</p>
      {subtitle && (
        <p className={`text-xs mt-1 ${
          trend === "up" ? "text-green-600" :
          trend === "down" ? "text-red-500" :
          "text-gray-400"
        }`}>
          {trend === "up" ? "↑" : trend === "down" ? "↓" : ""} {subtitle}
        </p>
      )}
    </div>
  );
}
