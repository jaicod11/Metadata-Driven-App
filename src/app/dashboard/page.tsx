import { Metadata } from "next";
import Link from "next/link";
import { requireAuth } from "@/lib/auth/session";
import { getUserApps } from "@/lib/db/queries/apps";
import { prisma } from "@/lib/db/prisma";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const user = await requireAuth();
  const apps = await getUserApps(user.id);

  // Total records across all apps
  const totalRecords = await prisma.appData.count({
    where: { app: { userId: user.id } },
  });

  const totalWorkflows = await prisma.workflow.count({
    where: { app: { userId: user.id }, isActive: true },
  });

  const stats = [
    { label: "Total Apps",      value: apps.length,     icon: "🗂️",  href: "/dashboard/apps" },
    { label: "Total Records",   value: totalRecords,    icon: "📦",  href: "/dashboard/apps" },
    { label: "Workflows",       value: totalWorkflows,  icon: "⚡",  href: null },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Good to see you, {user.name?.split(" ")[0] ?? "there"} 👋
        </h1>
        <p className="text-sm text-gray-500 mt-1">Here's an overview of your workspace.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {stats.map((s) => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
            <div className="text-2xl mb-2">{s.icon}</div>
            <p className="text-3xl font-bold text-gray-900">{s.value}</p>
            <p className="text-sm text-gray-500 mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Recent apps */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-gray-900">Your Apps</h2>
          <Link href="/dashboard/apps/new" className="text-sm text-blue-600 font-medium hover:underline">
            + New App
          </Link>
        </div>

        {apps.length === 0 ? (
          <div className="bg-white rounded-xl border border-dashed border-gray-300 p-12 text-center">
            <p className="text-4xl mb-3">🚀</p>
            <p className="font-semibold text-gray-700">No apps yet</p>
            <p className="text-sm text-gray-400 mt-1 mb-5">Create your first app by pasting a JSON config.</p>
            <Link
              href="/dashboard/apps/new"
              className="inline-flex items-center px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              Create App
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {apps.slice(0, 6).map((app: any) => (
              <div key={app.id} className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm hover:border-blue-300 transition-colors group">
                <div className="flex items-start justify-between mb-3">
                  <div className="w-9 h-9 bg-blue-100 rounded-lg flex items-center justify-center text-blue-600 font-bold text-sm">
                    {app.name.charAt(0).toUpperCase()}
                  </div>
                  <span className="text-xs text-gray-400">
                    {new Date(app.updatedAt).toLocaleDateString()}
                  </span>
                </div>
                <h3 className="font-semibold text-gray-900 truncate">{app.name}</h3>
                {app.description && (
                  <p className="text-xs text-gray-400 mt-0.5 truncate">{app.description}</p>
                )}
                <div className="flex items-center gap-3 mt-3 text-xs text-gray-400">
                  <span>{app._count.data} records</span>
                  <span>·</span>
                  <span>{app._count.workflows} workflows</span>
                </div>
                <div className="flex gap-2 mt-4">
                  <Link
                    href={`/runtime/${app.id}`}
                    className="flex-1 text-center text-xs px-3 py-1.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
                  >
                    Open App
                  </Link>
                  <Link
                    href={`/dashboard/apps/${app.id}`}
                    className="flex-1 text-center text-xs px-3 py-1.5 border border-gray-200 text-gray-600 rounded-lg font-medium hover:bg-gray-50 transition-colors"
                  >
                    Manage
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
