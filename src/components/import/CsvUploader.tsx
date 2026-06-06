// src/components/import/CsvUploader.tsx
"use client";

import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";

interface Props {
  onFileParsed: (file: File, headers: string[], rows: Record<string, string>[]) => void;
}

export function CsvUploader({ onFileParsed }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      setError(null);
      const file = acceptedFiles[0];
      if (!file) return;

      if (!file.name.endsWith(".csv") && file.type !== "text/csv") {
        setError("Only .csv files are accepted.");
        return;
      }

      if (file.size > 5 * 1024 * 1024) {
        setError("File too large — maximum 5 MB.");
        return;
      }

      setFileName(file.name);

      // Dynamic import so papaparse isn't in the server bundle
      const Papa = (await import("papaparse")).default;

      Papa.parse<Record<string, string>>(file, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (h) => h.trim(),
        transform: (v) => v.trim(),
        complete: (result) => {
          if (!result.meta.fields || result.meta.fields.length === 0) {
            setError("The CSV has no header row.");
            return;
          }
          onFileParsed(file, result.meta.fields, result.data);
        },
        error: (err) => setError(`Parse error: ${err.message}`),
      });
    },
    [onFileParsed]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "text/csv": [".csv"] },
    maxFiles: 1,
  });

  return (
    <div className="space-y-3">
      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${isDragActive
          ? "border-blue-400 bg-blue-50"
          : "border-gray-300 bg-gray-50 hover:border-blue-400 hover:bg-blue-50"
          }`}
      >
        <input {...getInputProps()} />
        <div className="text-3xl mb-3">📤</div>
        {isDragActive ? (
          <p className="text-sm font-medium text-blue-600">Drop the CSV here…</p>
        ) : (
          <>
            <p className="text-sm font-medium text-gray-700">
              Drag & drop a CSV file, or{" "}
              <span className="text-blue-600 underline">click to browse</span>
            </p>
            <p className="text-xs text-gray-400 mt-1">Max 5 MB · .csv only</p>
          </>
        )}
      </div>

      {fileName && !error && (
        <div className="flex items-center gap-2 px-4 py-2 bg-green-50 border border-green-200 rounded-lg">
          <span className="text-green-500 text-sm">✓</span>
          <span className="text-sm text-green-700 font-medium">{fileName}</span>
        </div>
      )}

      {error && (
        <div className="px-4 py-2 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}
    </div>
  );
}
