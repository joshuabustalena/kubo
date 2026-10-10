import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth";
import { AdminNav } from "./admin-nav";

export const metadata: Metadata = { title: { default: "Admin", template: "%s · Kainan sa Kubo Admin" } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAdmin("/admin");
  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <AdminNav name={user.full_name || user.email} />
      <main className="min-w-0 flex-1 px-4 py-6 lg:px-8 print:p-0">{children}</main>
    </div>
  );
}
