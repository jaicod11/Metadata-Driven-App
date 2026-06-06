// src/components/runtime/forms/fields/DateField.tsx
"use client";
import { FieldConfig } from "@/types/config.types";

interface Props { field: FieldConfig; value: unknown; error?: string; onChange: (v: unknown) => void; }

export function DateField({ field, value, onChange }: Props) {
  // Normalise to yyyy-mm-dd for <input type="date">
  let dateValue = "";
  if (value) {
    try {
      dateValue = new Date(String(value)).toISOString().split("T")[0];
    } catch {
      dateValue = "";
    }
  }

  return (
    <input
      type="date"
      value={dateValue}
      onChange={(e) => onChange(e.target.value)}
      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
    />
  );
}
