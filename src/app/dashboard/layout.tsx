import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth/session";
import { DashboardShell } from "@/components/layout/DashboardShell";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAuth();
  return <DashboardShell user={user}>{children}</DashboardShell>;
}
