// src/components/import/ImportPreview.tsx
"use client";

import { ColumnMapping } from "./ColumnMapper";

interface Props {
  rows: Record<string, string>[];
  mapping: ColumnMapping;
  maxPreview?: number;
}

export function ImportPreview({ rows, mapping, maxPreview = 5 }: Props) {
  // Only show mapped columns (non-null)
  const activeMappings = Object.entries(mapping).filter(
    ([, field]) => field !== null
  ) as [string, string][];

  if (activeMappings.length === 0) {
    return (
      <div className="px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg">
        <p className="text-xs text-gray-500">
          Map at least one column to preview rows.
        </p>
      </div>
    );
  }

  const preview = rows.slice(0, maxPreview);

  return (
    <div className="space-y-2">
      <p className="text-xs text-gray-500">
        Showing first {preview.length} of {rows.length} rows.
      </p>

      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <table className="min-w-full text-xs divide-y divide-gray-100">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left font-semibold text-gray-400 uppercase tracking-wide w-10">
                #
              </th>
              {activeMappings.map(([csvCol, field]) => (
                <th
                  key={csvCol}
                  className="px-3 py-2 text-left font-semibold text-gray-500 uppercase tracking-wide"
                >
                  {field}
                  <span className="ml-1 font-normal text-gray-300 normal-case">
                    ← {csvCol}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-50">
            {preview.map((row, i) => (
              <tr key={i} className="hover:bg-gray-50">
                <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                {activeMappings.map(([csvCol]) => (
                  <td
                    key={csvCol}
                    className="px-3 py-2 text-gray-700 max-w-[180px] truncate"
                    title={row[csvCol]}
                  >
                    {row[csvCol] || (
                      <span className="text-gray-300 italic">empty</span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
