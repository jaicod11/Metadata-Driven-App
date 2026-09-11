// src/components/runtime/forms/FieldRenderer.tsx
"use client";

import { AppConfig, FieldConfig } from "@/types/config.types";
import { TextField }    from "./fields/TextField";
import { NumberField }  from "./fields/NumberField";
import { SelectField }  from "./fields/SelectField";
import { CheckboxField }from "./fields/CheckboxField";
import { DateField }    from "./fields/DateField";
import { FileField }    from "./fields/FileField";
import { UnknownField } from "./fields/UnknownField";
import { RelationField } from "./fields/RelationField";
import { RelationValue } from "../relations/RelationValue";
import { isBelongsTo, isHasMany } from "@/lib/runtime/relations";
import { isComputed } from "@/lib/runtime/computed";

interface Props {
  field: FieldConfig;
  value: unknown;
  error?: string;
  onChange: (value: unknown) => void;
  /** Relation inputs need these to load the target entity's records. */
  appId?: string;
  config?: AppConfig;
  /** False when the role may see the field but not change it. */
  editable?: boolean;
}

export function FieldRenderer({
  field,
  value,
  error,
  onChange,
  appId,
  config,
  editable = true,
}: Props) {
  // Skip hidden fields entirely
  if (field.hidden) return null;

  // hasMany is not an input — children point back at this record instead.
  if (isHasMany(field)) return null;

  const fieldProps = { field, value, error, onChange };

  // Read-only — either for this role, or because the field is computed and has
  // no input at all. Nothing to type into, nothing to submit.
  const readOnly = !editable || isComputed(field);

  const input = readOnly ? (
    <ReadOnlyValue field={field} value={value} appId={appId} config={config} />
  ) : (() => {
    switch (field.type) {
      case "string":
      case "email":
      case "url":
      case "textarea":
        return <TextField {...fieldProps} />;
      case "number":
        return <NumberField {...fieldProps} />;
      case "select":
        return <SelectField {...fieldProps} />;
      case "boolean":
        return <CheckboxField {...fieldProps} />;
      case "date":
        return <DateField {...fieldProps} />;
      case "file":
        return <FileField {...fieldProps} />;
      case "relation":
        return <RelationField {...fieldProps} appId={appId} config={config} />;
      default:
        return <UnknownField {...fieldProps} />;
    }
  })();

  // Checkbox label is rendered inside the component itself
  if (field.type === "boolean" && !readOnly) {
    return (
      <div className="space-y-1">
        {input}
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <label className="block text-sm font-medium text-gray-700">
        {field.label ?? field.name}
        {field.required && <span className="text-red-500 ml-1" aria-hidden>*</span>}
      </label>
      {field.helpText && (
        <p className="text-xs text-gray-500">{field.helpText}</p>
      )}
      {input}
      {error && <p className="text-xs text-red-600 mt-0.5">{error}</p>}
    </div>
  );
}

// ── Read-only rendering ────────────────────────────────────────────────────────

/** A field the role may see but not change: its value, not an input. */
function ReadOnlyValue({
  field,
  value,
  appId,
  config,
}: {
  field: FieldConfig;
  value: unknown;
  appId?: string;
  config?: AppConfig;
}) {
  const box =
    "w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50 text-gray-600";

  if (isBelongsTo(field) && appId && config) {
    return (
      <div className={box}>
        <RelationValue value={value} field={field} appId={appId} config={config} />
      </div>
    );
  }

  if (value === null || value === undefined || value === "") {
    return <div className={`${box} text-gray-400`}>—</div>;
  }

  if (field.type === "boolean") {
    return <div className={box}>{value ? "✓ Yes" : "✗ No"}</div>;
  }

  if (field.type === "select") {
    const option = field.options?.find((o) => o.value === String(value));
    return <div className={box}>{option?.label ?? String(value)}</div>;
  }

  return <div className={box}>{String(value)}</div>;
}
