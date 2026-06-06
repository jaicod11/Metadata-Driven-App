import { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/auth/session";
import { getApp } from "@/lib/db/queries/apps";
import { getWorkflows } from "@/lib/db/queries/workflows";
import { WorkflowsPageClient } from "@/components/workflows/WorkflowsPageClient";
import { parseConfig } from "@/lib/runtime/schema-parser";

type Props = { params: { appId: string } };
export const metadata: Metadata = { title: "Workflows" };

export default async function WorkflowsPage({ params }: Props) {
  const user  = await requireAuth();
  const app   = await getApp(params.appId, user.id);
  if (!app) notFound();

  const workflows = await getWorkflows(params.appId);
  const parsed    = parseConfig(app.config);
  const entities  = parsed.config?.entities ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Workflows</h1>
        <p className="text-sm text-gray-500 mt-1">
          Automate actions on submit, update, or delete events in{" "}
          <span className="font-medium text-gray-700">{app.name}</span>.
        </p>
      </div>
      <WorkflowsPageClient
        appId={params.appId}
        initialWorkflows={JSON.parse(JSON.stringify(workflows))}
        entities={entities}
      />
    </div>
  );
}
