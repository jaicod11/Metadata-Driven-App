"use client";

import { useState } from "react";
import { EntityConfig } from "@/types/config.types";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import toast from "react-hot-toast";

interface Workflow { id: string; name: string; description?: string; trigger: any; steps: any[]; isActive: boolean; _count: { executions: number }; }

interface Props { appId: string; initialWorkflows: Workflow[]; entities: EntityConfig[]; }

const TRIGGER_TYPES  = ["onSubmit", "onUpdate", "onDelete", "schedule", "manual"] as const;
const ACTION_TYPES   = ["sendEmail", "callWebhook", "transform", "notify", "condition"] as const;

export function WorkflowsPageClient({ appId, initialWorkflows, entities }: Props) {
  const [workflows, setWorkflows] = useState(initialWorkflows);
  const [showForm, setShowForm]   = useState(false);

  const refresh = async () => {
    const res  = await fetch(`/api/workflows?appId=${appId}`);
    const data = await res.json();
    if (res.ok) setWorkflows(data.data);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this workflow?")) return;
    await fetch(`/api/workflows/${id}?appId=${appId}`, { method: "DELETE" });
    toast.success("Workflow deleted");
    refresh();
  };

  const handleExecute = async (id: string) => {
    const res  = await fetch(`/api/workflows/${id}/execute?appId=${appId}`, { method: "POST" });
    const data = await res.json();
    if (res.ok) toast.success(`Workflow executed: ${data.data.status}`);
    else        toast.error(data.error?.message ?? "Execution failed");
  };

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <Button onClick={() => setShowForm(!showForm)}>
          {showForm ? "Cancel" : "+ New Workflow"}
        </Button>
      </div>

      {showForm && (
        <WorkflowForm appId={appId} entities={entities} onCreated={() => { setShowForm(false); refresh(); }} />
      )}

      {workflows.length === 0 && !showForm ? (
        <div className="bg-white rounded-xl border border-dashed border-gray-300 p-12 text-center">
          <p className="text-3xl mb-2">⚡</p>
          <p className="font-semibold text-gray-700">No workflows yet</p>
          <p className="text-sm text-gray-400 mt-1">Automate actions when records are created, updated, or deleted.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {workflows.map((wf) => (
            <div key={wf.id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-gray-900">{wf.name}</h3>
                    <Badge variant={wf.isActive ? "success" : "default"}>
                      {wf.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                  {wf.description && <p className="text-xs text-gray-400 mt-0.5">{wf.description}</p>}
                  <div className="flex flex-wrap gap-2 mt-2">
                    <span className="text-xs font-mono px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full">
                      trigger: {wf.trigger?.type}{wf.trigger?.entity ? ` on ${wf.trigger.entity}` : ""}
                    </span>
                    <span className="text-xs text-gray-400">{wf.steps?.length ?? 0} step(s)</span>
                    <span className="text-xs text-gray-400">{wf._count?.executions ?? 0} run(s)</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button size="sm" variant="secondary" onClick={() => handleExecute(wf.id)}>Run</Button>
                  <Button size="sm" variant="danger" onClick={() => handleDelete(wf.id)}>Delete</Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Inline create form ─────────────────────────────────────────────────────────

function WorkflowForm({ appId, entities, onCreated }: { appId: string; entities: EntityConfig[]; onCreated: () => void }) {
  const [name, setName]         = useState("");
  const [desc, setDesc]         = useState("");
  const [triggerType, setTrigger] = useState<string>("onSubmit");
  const [entity, setEntity]     = useState(entities[0]?.name ?? "");
  const [steps, setSteps]       = useState([{ type: "notify", config: { message: "New record submitted: {{name}}" } }]);
  const [saving, setSaving]     = useState(false);

  const addStep = () => setSteps((s) => [...s, { type: "notify", config: { message: "" } }]);
  const removeStep = (i: number) => setSteps((s) => s.filter((_, idx) => idx !== i));

  const handleSave = async () => {
    if (!name.trim()) { toast.error("Workflow name is required"); return; }
    setSaving(true);
    const res = await fetch("/api/workflows", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appId, name, description: desc, trigger: { type: triggerType, entity: triggerType !== "manual" ? entity : undefined }, steps }),
    });
    const data = await res.json();
    setSaving(false);
    if (res.ok) { toast.success("Workflow created!"); onCreated(); }
    else        toast.error(data.error?.message ?? "Failed to create workflow");
  };

  return (
    <div className="bg-white rounded-xl border border-blue-200 shadow-sm p-5 space-y-4">
      <h3 className="font-semibold text-gray-900">New Workflow</h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1">
          <label className="text-xs font-medium text-gray-600">Name *</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Notify on submit"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-gray-600">Description</label>
          <input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Optional"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1">
          <label className="text-xs font-medium text-gray-600">Trigger</label>
          <select value={triggerType} onChange={(e) => setTrigger(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
            {TRIGGER_TYPES.map((t) => <option key={t}>{t}</option>)}
          </select>
        </div>
        {triggerType !== "manual" && entities.length > 0 && (
          <div className="space-y-1">
            <label className="text-xs font-medium text-gray-600">Entity</label>
            <select value={entity} onChange={(e) => setEntity(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
              {entities.map((e) => <option key={e.name}>{e.name}</option>)}
            </select>
          </div>
        )}
      </div>

      {/* Steps */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-medium text-gray-600">Steps</label>
          <button onClick={addStep} className="text-xs text-blue-600 hover:underline font-medium">+ Add step</button>
        </div>
        <div className="space-y-2">
          {steps.map((step, i) => (
            <div key={i} className="flex gap-2 items-start p-3 bg-gray-50 rounded-lg border border-gray-200">
              <select value={step.type} onChange={(e) => setSteps((s) => s.map((st, j) => j === i ? { ...st, type: e.target.value } : st))}
                className="px-2 py-1.5 border border-gray-300 rounded-lg text-xs bg-white focus:outline-none">
                {ACTION_TYPES.map((t) => <option key={t}>{t}</option>)}
              </select>
              <input
                value={typeof step.config === "object" ? JSON.stringify(step.config) : ""}
                onChange={(e) => {
                  try { const cfg = JSON.parse(e.target.value); setSteps((s) => s.map((st, j) => j === i ? { ...st, config: cfg } : st)); } catch {}
                }}
                placeholder='{"message": "Hello {{name}}"}'
                className="flex-1 px-2 py-1.5 border border-gray-300 rounded-lg text-xs font-mono focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
              />
              <button onClick={() => removeStep(i)} className="text-red-400 hover:text-red-600 text-xs px-1">✕</button>
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-2">
        <Button onClick={handleSave} loading={saving}>Create Workflow</Button>
      </div>
    </div>
  );
}
