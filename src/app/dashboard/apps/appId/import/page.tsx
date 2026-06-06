import { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/auth/session";
import { getApp } from "@/lib/db/queries/apps";
import { parseConfig } from "@/lib/runtime/schema-parser";
import { CsvImportPage } from "@/components/import/CsvImportPage";

type Props = { params: { appId: string } };
export const metadata: Metadata = { title: "Import CSV" };

export default async function ImportPage({ params }: Props) {
  const user = await requireAuth();
  const app  = await getApp(params.appId, user.id);
  if (!app) notFound();

  const parsed   = parseConfig(app.config);
  const entities = parsed.config?.entities ?? [];

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Import CSV</h1>
        <p className="text-sm text-gray-500 mt-1">
          Upload a CSV file and map its columns to an entity's fields.
          Valid rows are imported; errors are shown per row.
        </p>
      </div>
      <CsvImportPage appId={params.appId} entities={entities} />
    </div>
  );
}
