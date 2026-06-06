// src/components/runtime/FallbackComponent.tsx
"use client";

interface FallbackComponentProps {
  page?: { layout?: string };
  type?: string;
  [key: string]: unknown; // absorb any props passed by RuntimeRenderer
}

export function FallbackComponent({ page, type }: FallbackComponentProps) {
  const unknownType = type ?? page?.layout ?? "unknown";

  return (
    <div className="flex items-start gap-3 p-4 rounded-lg border border-dashed border-amber-400 bg-amber-50">
      <span className="text-amber-500 mt-0.5 text-lg">⚠</span>
      <div>
        <p className="text-sm font-medium text-amber-800">
          Unknown component type: <code className="font-mono bg-amber-100 px-1 rounded">"{unknownType}"</code>
        </p>
        <p className="text-xs text-amber-600 mt-1">
          Register this type by calling{" "}
          <code className="font-mono bg-amber-100 px-1 rounded">
            registerComponent("{unknownType}", YourComponent)
          </code>{" "}
          in ComponentRegistry.ts
        </p>
      </div>
    </div>
  );
}
