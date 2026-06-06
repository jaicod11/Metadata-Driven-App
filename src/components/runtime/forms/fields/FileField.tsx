// src/components/runtime/forms/fields/FileField.tsx
"use client";
import { FieldConfig } from "@/types/config.types";

interface Props { field: FieldConfig; value: unknown; error?: string; onChange: (v: unknown) => void; }

export function FileField({ field, value, onChange }: Props) {
  return (
    <div className="space-y-2">
      <input
        type="file"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            // In production: upload to storage and set URL as the value
            // For now, store the filename
            onChange(file.name);
          }
        }}
        className="block w-full text-sm text-gray-500 file:mr-3 file:py-1.5 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer"
      />
      {Boolean(value) && (
        <p className="text-xs text-gray-500">
          Current:{" "}
          <span className="font-mono bg-gray-100 px-1 rounded">{String(value)}</span>
        </p>
      )}
    </div>
  );
}
