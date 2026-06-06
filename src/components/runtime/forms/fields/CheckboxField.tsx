// src/components/runtime/forms/fields/CheckboxField.tsx
"use client";
import { FieldConfig } from "@/types/config.types";

interface Props { field: FieldConfig; value: unknown; error?: string; onChange: (v: unknown) => void; }

export function CheckboxField({ field, value, onChange }: Props) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="checkbox"
        id={`field-${field.name}`}
        checked={Boolean(value)}
        onChange={(e) => onChange(e.target.checked)}
        className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
      />
      <label htmlFor={`field-${field.name}`} className="text-sm text-gray-700">
        {field.helpText ?? field.label ?? field.name}
      </label>
    </div>
  );
}
