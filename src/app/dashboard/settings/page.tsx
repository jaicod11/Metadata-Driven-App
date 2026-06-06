import { Metadata } from "next";
import { requireAuth } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await requireAuth();

  const accounts = await prisma.account.findMany({
    where: { userId: user.id },
    select: { provider: true },
  });

  const providers = accounts.map((a) => a.provider);

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-500 mt-1">Manage your account preferences.</p>
      </div>

      {/* Profile card */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Profile</h2>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div className="flex items-center gap-4">
            {user.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.image} alt={user.name ?? ""} className="w-14 h-14 rounded-full border-2 border-gray-200" />
            ) : (
              <div className="w-14 h-14 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-xl">
                {(user.name ?? user.email ?? "?").charAt(0).toUpperCase()}
              </div>
            )}
            <div>
              <p className="font-semibold text-gray-900">{user.name ?? "No name set"}</p>
              <p className="text-sm text-gray-500">{user.email}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Connected accounts */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">Connected Accounts</h2>
        </div>
        <div className="px-6 py-5 space-y-3">
          {[
            { id: "google", label: "Google", icon: "🔵" },
            { id: "github", label: "GitHub", icon: "⚫" },
          ].map((p) => (
            <div key={p.id} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span>{p.icon}</span>
                <span className="text-sm text-gray-700">{p.label}</span>
              </div>
              {providers.includes(p.id) ? (
                <span className="text-xs text-green-600 font-medium px-2 py-0.5 bg-green-50 rounded-full border border-green-200">
                  Connected
                </span>
              ) : (
                <span className="text-xs text-gray-400">Not connected</span>
              )}
            </div>
          ))}

          {providers.length === 0 && !accounts.length && (
            <p className="text-sm text-gray-400">Using email/password login.</p>
          )}
        </div>
      </div>
    </div>
  );
}
