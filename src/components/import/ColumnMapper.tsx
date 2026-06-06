// src/components/import/ColumnMapper.tsx
"use client";

import { EntityConfig } from "@/types/config.types";

export type ColumnMapping = Record<string, string | null>;
// key   = CSV column header
// value = entity field name, or null = skip

interface Props {
  csvHeaders: string[];
  entity: EntityConfig;
  mapping: ColumnMapping;
  onChange: (mapping: ColumnMapping) => void;
}

export function ColumnMapper({ csvHeaders, entity, mapping, onChange }: Props) {
  const fields = entity.fields.filter((f) => !f.hidden);

  const handleChange = (csvCol: string, fieldName: string | null) => {
    onChange({ ...mapping, [csvCol]: fieldName });
  };

  // Count how many required fields are unmapped
  const mappedFields = new Set(Object.values(mapping).filter(Boolean));
  const unmappedRequired = fields
    .filter((f) => f.required && !mappedFields.has(f.name))
    .map((f) => f.label ?? f.name);

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-gray-800 mb-1">
          Map CSV columns → entity fields
        </h3>
        <p className="text-xs text-gray-500">
          Match each CSV column to a field in{" "}
          <span className="font-medium text-gray-700">
            {entity.label ?? entity.name}
          </span>
          . Set a column to <em>Skip</em> to ignore it.
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200">
        <table className="min-w-full text-sm divide-y divide-gray-100">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                CSV Column
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Maps to Field
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-100">
            {csvHeaders.map((col) => (
              <tr key={col} className="hover:bg-gray-50">
                <td className="px-4 py-3 font-mono text-xs text-gray-700 bg-gray-50 w-1/2">
                  {col}
                </td>
                <td className="px-4 py-3 w-1/2">
                  <select
                    value={mapping[col] ?? ""}
                    onChange={(e) =>
                      handleChange(col, e.target.value || null)
                    }
                    className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">— Skip —</option>
                    {fields.map((f) => (
                      <option key={f.name} value={f.name}>
                        {f.label ?? f.name}
                        {f.required ? " *" : ""}
                        {" "}[{f.type}]
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {unmappedRequired.length > 0 && (
        <div className="px-4 py-3 bg-amber-50 border border-amber-200 rounded-lg">
          <p className="text-xs font-medium text-amber-800">
            Required fields not yet mapped:
          </p>
          <p className="text-xs text-amber-700 mt-0.5">
            {unmappedRequired.join(", ")}
          </p>
        </div>
      )}
    </div>
  );
}
