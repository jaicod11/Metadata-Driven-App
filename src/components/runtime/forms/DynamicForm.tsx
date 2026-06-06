// src/components/runtime/forms/DynamicForm.tsx
"use client";

import { useState } from "react";
import { AppConfig, EntityConfig, PageConfig } from "@/types/config.types";
import { FieldRenderer } from "./FieldRenderer";
import { revalidateEntity } from "@/hooks/useRuntimeData";

interface Props {
  page: PageConfig;
  entity?: EntityConfig;
  appId: string;
  config: AppConfig;
  /** If provided, pre-fills the form and uses PUT instead of POST */
  initialData?: Record<string, unknown>;
  recordId?: string;
  onSuccess?: (record: Record<string, unknown>) => void;
}

type SubmitStatus = "idle" | "loading" | "success" | "error";

export function DynamicForm({
  page,
  entity,
  appId,
  initialData,
  recordId,
  onSuccess,
}: Props) {
  const [formData, setFormData] = useState<Record<string, unknown>>(
    initialData ?? {}
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [status, setStatus] = useState<SubmitStatus>("idle");
  const [apiError, setApiError] = useState<string | null>(null);

  // ── Guard: no entity config ───────────────────────────────────────────────
  if (!entity) {
    return (
      <div className="p-4 rounded-lg border border-dashed border-amber-300 bg-amber-50">
        <p className="text-sm text-amber-700">
          No entity configured for this form. Add an <code className="font-mono text-xs bg-amber-100 px-1 rounded">entity</code> key to this page in your config.
        </p>
      </div>
    );
  }

  // ── Client-side validation ────────────────────────────────────────────────
  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    for (const field of entity.fields) {
      if (field.hidden) continue;
      if (field.required) {
        const v = formData[field.name];
        if (v === undefined || v === null || v === "") {
          newErrors[field.name] = `${field.label ?? field.name} is required`;
        }
      }
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setApiError(null);
    if (!validate()) return;

    setStatus("loading");

    try {
      const url = `/api/runtime/${appId}/${entity.name}${
        recordId ? `?id=${recordId}` : ""
      }`;
      const res = await fetch(url, {
        method: recordId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      const json = await res.json();

      if (!res.ok) {
        // Map API validation errors back to fields when possible
        if (Array.isArray(json.error?.details)) {
          const fieldErrors: Record<string, string> = {};
          json.error.details.forEach((msg: string) => {
            const match = msg.match(/^([^:]+): (.+)$/);
            if (match) fieldErrors[match[1]] = match[2];
          });
          if (Object.keys(fieldErrors).length > 0) {
            setErrors(fieldErrors);
          } else {
            setApiError(json.error.details.join("; "));
          }
        } else {
          setApiError(json.error?.message ?? "Submission failed");
        }
        setStatus("error");
        return;
      }

      setStatus("success");
      revalidateEntity(appId, entity.name);
      onSuccess?.(json.data);

      // Reset for create mode
      if (!recordId) {
        setFormData({});
        setErrors({});
        // Reset status after 3 s
        setTimeout(() => setStatus("idle"), 3000);
      }
    } catch {
      setApiError("Network error. Please try again.");
      setStatus("error");
    }
  };

  const handleReset = () => {
    setFormData(initialData ?? {});
    setErrors({});
    setStatus("idle");
    setApiError(null);
  };

  const visibleFields = entity.fields.filter((f) => !f.hidden);

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5 max-w-2xl">
      {visibleFields.map((field) => (
        <FieldRenderer
          key={field.name}
          field={field}
          value={formData[field.name] ?? field.defaultValue ?? ""}
          error={errors[field.name]}
          onChange={(val) => {
            setFormData((prev) => ({ ...prev, [field.name]: val }));
            // Clear field error on change
            if (errors[field.name]) {
              setErrors((prev) => {
                const next = { ...prev };
                delete next[field.name];
                return next;
              });
            }
          }}
        />
      ))}

      {/* API-level error (not field-specific) */}
      {apiError && (
        <div className="p-3 rounded-lg border border-red-200 bg-red-50">
          <p className="text-sm text-red-700">{apiError}</p>
        </div>
      )}

      {/* Success banner */}
      {status === "success" && (
        <div className="p-3 rounded-lg border border-green-200 bg-green-50">
          <p className="text-sm font-medium text-green-700">
            {recordId ? "Record updated successfully!" : "Record created successfully!"}
          </p>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-3 pt-1">
        <button
          type="submit"
          disabled={status === "loading"}
          className="px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {status === "loading"
            ? "Saving…"
            : recordId
            ? "Update"
            : "Create"}
        </button>
        <button
          type="button"
          onClick={handleReset}
          className="px-5 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
        >
          Reset
        </button>
      </div>
    </form>
  );
}
