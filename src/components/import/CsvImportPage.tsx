// src/components/import/CsvImportPage.tsx
"use client";

import { useState } from "react";
import { EntityConfig } from "@/types/config.types";
import { CsvUploader } from "./CsvUploader";
import { ColumnMapper, ColumnMapping } from "./ColumnMapper";
import { ImportPreview } from "./ImportPreview";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import toast from "react-hot-toast";

type Step = "upload" | "map" | "preview" | "done";

interface ImportResult {
  total: number;
  inserted: number;
  skipped: number;
  errors: { row: number; message: string }[];
}

interface Props {
  appId: string;
  entities: EntityConfig[];
}

export function CsvImportPage({ appId, entities }: Props) {
  const [step, setStep]         = useState<Step>("upload");
  const [selectedEntity, setSelectedEntity] = useState(entities[0]?.name ?? "");
  const [csvFile, setCsvFile]   = useState<File | null>(null);
  const [headers, setHeaders]   = useState<string[]>([]);
  const [rows, setRows]         = useState<Record<string, string>[]>([]);
  const [mapping, setMapping]   = useState<ColumnMapping>({});
  const [importing, setImporting] = useState(false);
  const [result, setResult]     = useState<ImportResult | null>(null);

  const entity = entities.find((e) => e.name === selectedEntity);

  // Auto-suggest mapping: if CSV header matches field name exactly, pre-map it
  const buildAutoMapping = (hdrs: string[]): ColumnMapping => {
    if (!entity) return {};
    const fieldNames = new Set(entity.fields.map((f) => f.name.toLowerCase()));
    return Object.fromEntries(
      hdrs.map((h) => {
        const match = entity.fields.find(
          (f) => f.name.toLowerCase() === h.toLowerCase() || (f.label ?? "").toLowerCase() === h.toLowerCase()
        );
        return [h, match?.name ?? null];
      })
    );
  };

  const handleFileParsed = (file: File, hdrs: string[], parsedRows: Record<string, string>[]) => {
    setCsvFile(file);
    setHeaders(hdrs);
    setRows(parsedRows);
    setMapping(buildAutoMapping(hdrs));
    setStep("map");
  };

  const handleImport = async () => {
    if (!csvFile || !entity) return;
    setImporting(true);

    const formData = new FormData();
    formData.append("file",    csvFile);
    formData.append("appId",   appId);
    formData.append("entity",  entity.name);
    formData.append("mapping", JSON.stringify(mapping));

    try {
      const res  = await fetch("/api/import/csv", { method: "POST", body: formData });
      const json = await res.json();

      if (!res.ok) {
        toast.error(json.error?.message ?? "Import failed");
        return;
      }

      setResult(json.data);
      setStep("done");
      toast.success(`Imported ${json.data.inserted} records!`);
    } catch {
      toast.error("Network error — please try again.");
    } finally {
      setImporting(false);
    }
  };

  const reset = () => {
    setStep("upload");
    setCsvFile(null);
    setHeaders([]);
    setRows([]);
    setMapping({});
    setResult(null);
  };

  // ── Guard: no entities ────────────────────────────────────────────────────
  if (entities.length === 0) {
    return (
      <div className="p-6 bg-amber-50 border border-amber-200 rounded-xl text-sm text-amber-800">
        This app has no entities defined. Add entities to your config before importing.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Step indicator */}
      <div className="flex items-center gap-2 text-xs">
        {(["upload", "map", "preview", "done"] as Step[]).map((s, i, arr) => (
          <div key={s} className="flex items-center gap-2">
            <span className={`px-2.5 py-1 rounded-full font-medium ${
              step === s
                ? "bg-blue-600 text-white"
                : arr.indexOf(step) > i
                ? "bg-green-100 text-green-700"
                : "bg-gray-100 text-gray-500"
            }`}>
              {i + 1}. {s.charAt(0).toUpperCase() + s.slice(1)}
            </span>
            {i < arr.length - 1 && <span className="text-gray-300">→</span>}
          </div>
        ))}
      </div>

      {/* Entity selector */}
      {step !== "done" && (
        <div className="space-y-1">
          <label className="block text-sm font-medium text-gray-700">
            Import into entity
          </label>
          <select
            value={selectedEntity}
            onChange={(e) => { setSelectedEntity(e.target.value); reset(); }}
            disabled={step !== "upload"}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-60"
          >
            {entities.map((e) => (
              <option key={e.name} value={e.name}>
                {e.label ?? e.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Step: Upload */}
      {step === "upload" && (
        <CsvUploader onFileParsed={handleFileParsed} />
      )}

      {/* Step: Map */}
      {step === "map" && entity && (
        <div className="space-y-5">
          <ColumnMapper
            csvHeaders={headers}
            entity={entity}
            mapping={mapping}
            onChange={setMapping}
          />
          <div className="flex gap-3">
            <Button onClick={() => setStep("preview")} disabled={Object.values(mapping).every((v) => !v)}>
              Preview →
            </Button>
            <Button variant="secondary" onClick={reset}>Back</Button>
          </div>
        </div>
      )}

      {/* Step: Preview */}
      {step === "preview" && entity && (
        <div className="space-y-5">
          <ImportPreview rows={rows} mapping={mapping} maxPreview={8} />

          <div className="flex items-center gap-3 p-4 bg-blue-50 border border-blue-200 rounded-xl">
            <div className="text-blue-500 text-xl">ℹ️</div>
            <p className="text-sm text-blue-800">
              <span className="font-semibold">{rows.length} rows</span> ready to import into{" "}
              <span className="font-semibold">{entity.label ?? entity.name}</span>.
              Rows that fail validation will be skipped and listed after import.
            </p>
          </div>

          <div className="flex gap-3">
            <Button onClick={handleImport} loading={importing}>
              Import {rows.length} rows
            </Button>
            <Button variant="secondary" onClick={() => setStep("map")}>
              Back
            </Button>
          </div>
        </div>
      )}

      {/* Step: Done */}
      {step === "done" && result && (
        <div className="space-y-4">
          <div className="p-6 bg-white border border-gray-200 rounded-xl shadow-sm space-y-4">
            <h3 className="font-semibold text-gray-900 text-lg">Import Complete</h3>

            <div className="grid grid-cols-3 gap-4">
              <Stat label="Total rows"  value={result.total}    color="gray" />
              <Stat label="Imported"    value={result.inserted} color="green" />
              <Stat label="Skipped"     value={result.skipped}  color="amber" />
            </div>

            {result.errors.length > 0 && (
              <div className="mt-2">
                <p className="text-sm font-medium text-gray-700 mb-2">
                  Row errors ({result.errors.length}):
                </p>
                <div className="max-h-48 overflow-y-auto space-y-1">
                  {result.errors.map((e) => (
                    <div key={e.row} className="flex gap-2 text-xs px-3 py-1.5 bg-red-50 border border-red-100 rounded-lg">
                      <span className="text-red-400 font-mono shrink-0">Row {e.row}</span>
                      <span className="text-red-700">{e.message}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-3">
            <Button onClick={reset} variant="secondary">Import Another File</Button>
            <a
              href={`/runtime/${appId}`}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              View in App →
            </a>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: "gray" | "green" | "amber" }) {
  const colors = {
    gray:  "bg-gray-50 text-gray-700",
    green: "bg-green-50 text-green-700",
    amber: "bg-amber-50 text-amber-700",
  };
  return (
    <div className={`${colors[color]} rounded-xl p-4 text-center`}>
      <p className="text-3xl font-bold">{value}</p>
      <p className="text-xs mt-0.5 opacity-70">{label}</p>
    </div>
  );
}
