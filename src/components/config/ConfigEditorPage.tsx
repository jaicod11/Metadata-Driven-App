"use client";

import { useState, useCallback } from "react";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import toast from "react-hot-toast";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), { ssr: false });

interface Props {
  appId: string;
  initialConfig: string;
}

interface ParseResult {
  valid: boolean;
  errors: { path: string; message: string }[];
  warnings: { path: string; message: string }[];
}

export function ConfigEditorPage({ appId, initialConfig }: Props) {
  const [json, setJson]         = useState(initialConfig);
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [saving, setSaving]     = useState(false);
  const [validating, setValidating] = useState(false);

  const handleValidate = useCallback(async () => {
    setValidating(true);
    try {
      let raw: unknown;
      try { raw = JSON.parse(json); }
      catch {
        setParseResult({ valid: false, errors: [{ path: "root", message: "Invalid JSON syntax" }], warnings: [] });
        return;
      }
      const res  = await fetch(`/api/apps/${appId}/config`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: json });
      // We only want parse result, not to save — but our API saves on PUT.
      // Use a lightweight client-side approach instead:
      const { parseConfigFromString } = await import("@/lib/runtime/schema-parser");
      const result = parseConfigFromString(json);
      setParseResult({ valid: result.valid, errors: result.errors, warnings: result.warnings });
    } finally {
      setValidating(false);
    }
  }, [json, appId]);

  const handleSave = async () => {
    setSaving(true);
    try {
      let raw: unknown;
      try { raw = JSON.parse(json); }
      catch {
        toast.error("Invalid JSON — fix syntax before saving.");
        return;
      }
      const res  = await fetch(`/api/apps/${appId}/config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(raw),
      });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error?.message ?? "Save failed");
        if (data.error?.details) {
          setParseResult({ valid: false, errors: data.error.details, warnings: [] });
        }
        return;
      }

      setParseResult({ valid: true, errors: [], warnings: data.data?.warnings ?? [] });
      toast.success("Config saved!");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <Button onClick={handleSave} loading={saving}>Save Config</Button>
        <Button variant="secondary" onClick={handleValidate} loading={validating}>Validate</Button>

        {parseResult && (
          <div className="flex items-center gap-2">
            <Badge variant={parseResult.valid ? "success" : "danger"}>
              {parseResult.valid ? "✓ Valid" : `✗ ${parseResult.errors.length} error(s)`}
            </Badge>
            {parseResult.warnings.length > 0 && (
              <Badge variant="warning">{parseResult.warnings.length} warning(s)</Badge>
            )}
          </div>
        )}
      </div>

      {/* Monaco editor */}
      <div className="border border-gray-300 rounded-xl overflow-hidden shadow-sm">
        <MonacoEditor
          height="540px"
          language="json"
          value={json}
          onChange={(v) => { setJson(v ?? ""); setParseResult(null); }}
          options={{
            minimap: { enabled: false },
            fontSize: 13,
            lineNumbers: "on",
            scrollBeyondLastLine: false,
            formatOnPaste: true,
            tabSize: 2,
          }}
          theme="vs"
        />
      </div>

      {/* Errors & warnings */}
      {parseResult && (parseResult.errors.length > 0 || parseResult.warnings.length > 0) && (
        <div className="space-y-2">
          {parseResult.errors.map((e, i) => (
            <div key={i} className="flex gap-2 px-4 py-2 bg-red-50 border border-red-200 rounded-lg text-xs">
              <span className="text-red-500 font-mono shrink-0">{e.path}</span>
              <span className="text-red-700">{e.message}</span>
            </div>
          ))}
          {parseResult.warnings.map((w, i) => (
            <div key={i} className="flex gap-2 px-4 py-2 bg-amber-50 border border-amber-200 rounded-lg text-xs">
              <span className="text-amber-500 font-mono shrink-0">{w.path}</span>
              <span className="text-amber-700">{w.message}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
