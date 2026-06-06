import { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/auth/session";
import { getApp } from "@/lib/db/queries/apps";
import { ConfigEditorPage } from "@/components/config/ConfigEditorPage";

type Props = { params: { appId: string } };

export const metadata: Metadata = { title: "Edit Config" };

export default async function AppConfigPage({ params }: Props) {
  const user = await requireAuth();
  const app = await getApp(params.appId, user.id);
  if (!app) notFound();

  return (
    <div className="space-y-4 h-full">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Config Editor</h1>
        <p className="text-sm text-gray-500 mt-1">
          Edit the JSON configuration for <span className="font-medium text-gray-700">{app.name}</span>.
          Changes are validated before saving.
        </p>
      </div>
      <ConfigEditorPage appId={params.appId} initialConfig={JSON.stringify(app.config, null, 2)} />
    </div>
  );
}
