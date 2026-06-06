// src/components/runtime/forms/fields/TextField.tsx
"use client";

import { FieldConfig } from "@/types/config.types";

interface Props {
  field: FieldConfig;
  value: unknown;
  error?: string;
  onChange: (value: unknown) => void;
}

const base =
  "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm " +
  "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent " +
  "placeholder:text-gray-400 transition-colors";

export function TextField({ field, value, onChange }: Props) {
  const strValue = value === null || value === undefined ? "" : String(value);

  if (field.type === "textarea") {
    return (
      <textarea
        value={strValue}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.placeholder}
        rows={4}
        maxLength={field.validation?.maxLength}
        className={`${base} resize-y min-h-[96px]`}
      />
    );
  }

  const inputType =
    field.type === "email" ? "email" : field.type === "url" ? "url" : "text";

  return (
    <input
      type={inputType}
      value={strValue}
      onChange={(e) => onChange(e.target.value)}
      placeholder={field.placeholder}
      maxLength={field.validation?.maxLength}
      className={base}
    />
  );
}
