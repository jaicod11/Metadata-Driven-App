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
import { isHasMany } from "@/lib/runtime/relations";

interface Props {
  field: FieldConfig;
  value: unknown;
  error?: string;
  onChange: (value: unknown) => void;
  /** Relation inputs need these to load the target entity's records. */
  appId?: string;
  config?: AppConfig;
}

export function FieldRenderer({ field, value, error, onChange, appId, config }: Props) {
  // Skip hidden fields entirely
  if (field.hidden) return null;

  // hasMany is not an input — children point back at this record instead.
  if (isHasMany(field)) return null;

  const fieldProps = { field, value, error, onChange };

  const input = (() => {
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
  if (field.type === "boolean") {
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
