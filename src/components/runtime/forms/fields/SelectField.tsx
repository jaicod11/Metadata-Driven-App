// src/components/runtime/forms/fields/SelectField.tsx
"use client";
import { FieldConfig } from "@/types/config.types";

interface Props { field: FieldConfig; value: unknown; error?: string; onChange: (v: unknown) => void; }

export function SelectField({ field, value, onChange }: Props) {
  const options = field.options ?? [];

  if (options.length === 0) {
    return (
      <div className="px-3 py-2 border border-dashed border-amber-300 bg-amber-50 rounded-lg text-sm text-amber-600">
        Select field "{field.name}" has no options defined.
      </div>
    );
  }

  return (
    <select
      value={value === null || value === undefined ? "" : String(value)}
      onChange={(e) => onChange(e.target.value)}
      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white transition-colors"
    >
      <option value="">{field.placeholder ?? `Select ${field.label ?? field.name}…`}</option>
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}
