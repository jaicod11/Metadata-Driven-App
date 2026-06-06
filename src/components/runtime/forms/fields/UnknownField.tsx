// src/components/runtime/forms/fields/UnknownField.tsx
"use client";
import { FieldConfig } from "@/types/config.types";

interface Props { field: FieldConfig; value: unknown; error?: string; onChange: (v: unknown) => void; }

export function UnknownField({ field, value, onChange }: Props) {
  // Render as a plain text input so the form remains usable
  return (
    <div className="space-y-1">
      <input
        type="text"
        value={value === null || value === undefined ? "" : String(value)}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.placeholder}
        className="w-full px-3 py-2 border border-dashed border-amber-400 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-amber-50"
      />
      <p className="text-xs text-amber-500">
        Unknown field type "{field.type}" — rendered as plain text.
      </p>
    </div>
  );
}
