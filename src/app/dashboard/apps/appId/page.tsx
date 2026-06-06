import { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/auth/session";
import { getApp } from "@/lib/db/queries/apps";
import { parseConfig } from "@/lib/runtime/schema-parser";

type Props = { params: { appId: string } };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: `App Settings` };
}

export default async function AppDetailPage({ params }: Props) {
  const user = await requireAuth();
  const app = await getApp(params.appId, user.id);
  if (!app) notFound();

  const parsed = parseConfig(app.config);
  const config = parsed.config;

  const links = [
    { href: `/runtime/${app.id}`,                        label: "Open Live App",      icon: "🚀", primary: true },
    { href: `/dashboard/apps/${app.id}/config`,          label: "Edit Config",         icon: "✏️" },
    { href: `/dashboard/apps/${app.id}/workflows`,       label: "Manage Workflows",    icon: "⚡" },
    { href: `/dashboard/apps/${app.id}/import`,          label: "Import CSV",          icon: "📤" },
  ];

  return (
    <div className="max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center text-blue-700 font-bold">
              {app.name.charAt(0)}
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{app.name}</h1>
              {app.description && <p className="text-sm text-gray-500">{app.description}</p>}
            </div>
          </div>
        </div>
        <span className="text-xs text-gray-400">
          Updated {new Date(app.updatedAt).toLocaleDateString()}
        </span>
      </div>

      {/* Parse warnings */}
      {parsed.warnings.length > 0 && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
          <p className="text-sm font-medium text-amber-800 mb-2">Config warnings</p>
          <ul className="space-y-1">
            {parsed.warnings.map((w, i) => (
              <li key={i} className="text-xs text-amber-700">
                <span className="font-mono text-amber-500">{w.path}:</span> {w.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Quick actions */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={`flex flex-col items-center gap-2 p-4 rounded-xl border text-center text-sm font-medium transition-colors ${
              l.primary
                ? "bg-blue-600 border-blue-600 text-white hover:bg-blue-700"
                : "bg-white border-gray-200 text-gray-700 hover:border-blue-300 hover:bg-blue-50"
            }`}
          >
            <span className="text-xl">{l.icon}</span>
            {l.label}
          </Link>
        ))}
      </div>

      {/* Config summary */}
      {config && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm divide-y divide-gray-100">
          <div className="px-5 py-3">
            <h2 className="font-semibold text-gray-900 text-sm">Configuration Summary</h2>
          </div>
          <div className="px-5 py-4 space-y-3">
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                Entities ({config.entities.length})
              </p>
              <div className="flex flex-wrap gap-2">
                {config.entities.map((e) => (
                  <span key={e.name} className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded-lg font-mono">
                    {e.name} ({e.fields.length} fields)
                  </span>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                Pages ({config.pages.length})
              </p>
              <div className="flex flex-wrap gap-2">
                {config.pages.map((p) => (
                  <span key={p.path} className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded-lg font-mono">
                    {p.path} [{p.layout}]
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
