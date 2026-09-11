// src/components/runtime/tables/TableActions.tsx
"use client";

import { useState } from "react";
import Link from "next/link";

interface Props {
  record: Record<string, unknown>;
  appId: string;
  entity: string;
  onDelete: (id: string) => Promise<void>;
  /** Set when the config defines a detail page for this entity. */
  detailHref?: string;
}

export function TableActions({ record, onDelete, detailHref }: Props) {
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    if (!confirm("Delete this record? This cannot be undone.")) return;
    setIsDeleting(true);
    try {
      await onDelete(String(record.id));
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="flex items-center justify-end gap-2">
      {detailHref && (
        <Link
          href={detailHref}
          className="text-xs text-blue-600 hover:text-blue-800 font-medium transition-colors px-2 py-1 rounded hover:bg-blue-50"
        >
          View
        </Link>
      )}
      <button
        onClick={handleDelete}
        disabled={isDeleting}
        className="text-xs text-red-600 hover:text-red-800 disabled:opacity-40 font-medium transition-colors px-2 py-1 rounded hover:bg-red-50"
        aria-label="Delete record"
      >
        {isDeleting ? "Deleting…" : "Delete"}
      </button>
    </div>
  );
}
