import { Metadata } from "next";
import Link from "next/link";
import { requireAuth } from "@/lib/auth/session";
import { getUserApps } from "@/lib/db/queries/apps";

export const metadata: Metadata = { title: "My Apps" };

export default async function AppsPage() {
  const user = await requireAuth();
  const apps = await getUserApps(user.id);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Apps</h1>
          <p className="text-sm text-gray-500 mt-1">{apps.length} app{apps.length !== 1 ? "s" : ""}</p>
        </div>
        <Link
          href="/dashboard/apps/new"
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          + New App
        </Link>
      </div>

      {apps.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-gray-300 p-16 text-center">
          <p className="text-4xl mb-3">🗂️</p>
          <p className="font-semibold text-gray-700">No apps yet</p>
          <p className="text-sm text-gray-400 mt-1 mb-6">Create one from a JSON config in seconds.</p>
          <Link href="/dashboard/apps/new" className="px-5 py-2 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors">
            Create your first app
          </Link>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm divide-y divide-gray-100">
          {apps.map((app: any) => (
            <div key={app.id} className="flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors">
              <div className="flex items-center gap-4 min-w-0">
                <div className="w-9 h-9 bg-gradient-to-br from-blue-100 to-blue-200 rounded-lg flex items-center justify-center text-blue-700 font-bold text-sm shrink-0">
                  {app.name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-gray-900 truncate">{app.name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {app._count.data} records · {app._count.workflows} workflows · updated {new Date(app.updatedAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0 ml-4">
                <Link href={`/runtime/${app.id}`} className="px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
                  Open
                </Link>
                <Link href={`/dashboard/apps/${app.id}`} className="px-3 py-1.5 text-xs font-medium border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors">
                  Settings
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
