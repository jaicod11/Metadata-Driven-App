"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import toast from "react-hot-toast";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), { ssr: false });

const SAMPLE_CONFIG = JSON.stringify({
  name: "My CRM",
  description: "A simple contact manager",
  entities: [
    {
      name: "contact",
      label: "Contact",
      fields: [
        { name: "name",    type: "string", label: "Full Name",  required: true },
        { name: "email",   type: "email",  label: "Email",      required: true },
        { name: "phone",   type: "string", label: "Phone",      required: false },
        { name: "status",  type: "select", label: "Status",
          options: [
            { label: "Lead",   value: "lead" },
            { label: "Active", value: "active" },
            { label: "Closed", value: "closed" },
          ],
        },
      ],
    },
  ],
  pages: [
    { path: "/",        title: "Dashboard",  layout: "dashboard" },
    { path: "/contacts",title: "Contacts",   layout: "table",    entity: "contact" },
    { path: "/new",     title: "Add Contact",layout: "form",     entity: "contact" },
  ],
}, null, 2);

export function NewAppForm() {
  const router  = useRouter();
  const [json, setJson]     = useState(SAMPLE_CONFIG);
  const [name, setName]     = useState("");
  const [desc, setDesc]     = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    setErrors([]);
    let parsedConfig: unknown;
    try {
      parsedConfig = JSON.parse(json);
    } catch {
      setErrors(["Invalid JSON — please check your syntax."]);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/apps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name || (parsedConfig as any)?.name || "Untitled App",
          description: desc,
          config: parsedConfig,
        }),
      });

      const json2 = await res.json();

      if (!res.ok) {
        const errs = json2.error?.details?.map((e: any) => e.message ?? e) ?? [json2.error?.message];
        setErrors(errs.filter(Boolean));
        return;
      }

      toast.success("App created successfully!");
      router.push(`/dashboard/apps/${json2.data.id}`);
    } catch {
      setErrors(["Network error. Please try again."]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Name + description */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1">
          <label className="block text-sm font-medium text-gray-700">App Name <span className="text-gray-400 text-xs">(optional — uses config name)</span></label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. My CRM"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="space-y-1">
          <label className="block text-sm font-medium text-gray-700">Description <span className="text-gray-400 text-xs">(optional)</span></label>
          <input
            type="text"
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            placeholder="What does this app do?"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Monaco editor */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          JSON Configuration <span className="text-red-500">*</span>
        </label>
        <div className="border border-gray-300 rounded-xl overflow-hidden shadow-sm">
          <MonacoEditor
            height="480px"
            language="json"
            value={json}
            onChange={(v) => setJson(v ?? "")}
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
      </div>

      {/* Errors */}
      {errors.length > 0 && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl">
          <p className="text-sm font-medium text-red-700 mb-2">Please fix these errors:</p>
          <ul className="space-y-1">
            {errors.map((e, i) => (
              <li key={i} className="text-xs text-red-600">• {e}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex items-center gap-3">
        <Button onClick={handleCreate} loading={loading} size="lg">
          Create App
        </Button>
        <Button variant="secondary" onClick={() => router.back()}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
