import type { Metadata } from "next";
import { requireStaff } from "@/lib/auth";
import { PosNav } from "./pos-nav";

export const metadata: Metadata = { title: { default: "POS", template: "%s · Kainan sa Kubo POS" } };

export default async function PosLayout({ children }: { children: React.ReactNode }) {
  const user = await requireStaff("/pos");
  return (
    <div className="flex min-h-screen flex-col">
      <PosNav name={user.full_name || user.email} isAdmin={user.role === "admin"}
        canApprove={user.role === "admin" || user.permissions.some((p) => p !== "view_sales")}
      />
      <div className="flex-1">{children}</div>
    </div>
  );
}
