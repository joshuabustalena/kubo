import type { Metadata } from "next";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getCurrentUser, hasPermission } from "@/lib/auth";
import { peso } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import { STAFF_PERMISSIONS } from "@/lib/types";
import { PinForm } from "./pin-form";

export const metadata: Metadata = { title: "My PIN" };

export default async function PosMePage() {
  const user = (await getCurrentUser())!;
  const supabase = await createClient();
  const { data: hasPin } = await supabase.rpc("has_pin");
  let today: Record<string, number> | null = null;
  if (hasPermission(user, "view_sales")) {
    const { data } = await supabase.rpc("staff_today_summary");
    today = data;
  }
  const canApprove = user.role === "admin" || user.permissions.some((p) => p !== "view_sales");

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4">
      <Card>
        <CardHeader title={user.full_name || user.email} description={user.role === "admin" ? "Admin" : "Staff"} />
        <CardBody className="flex flex-wrap gap-1.5">
          {user.role === "admin" ? <Badge tone="forest">All permissions</Badge> : null}
          {user.role === "staff" && user.permissions.length === 0 ? <span className="text-sm text-ink-muted">Standard cashier access. Discounts, voids and refunds need a manager PIN.</span> : null}
          {user.role === "staff" ? STAFF_PERMISSIONS.filter((p) => user.permissions.includes(p.value)).map((p) => <Badge key={p.value} tone="green">{p.label}</Badge>) : null}
        </CardBody>
      </Card>
      {canApprove ? (
        <Card>
          <CardHeader title="Approval PIN" description="Used to approve other cashiers' discounts, voids or refunds that you are allowed to do." />
          <CardBody>
            <PinForm hasPin={!!hasPin} />
          </CardBody>
        </Card>
      ) : null}
      {today ? (
        <Card>
          <CardHeader title="Today's sales" description="Completed orders today (Asia/Manila)." />
          <CardBody className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              ["Orders", String(today.orders)],
              ["Net sales", peso(today.net_sales)],
              ["Cash received", peso(today.cash_received)],
              ["Digital", peso(today.digital_received)],
            ].map(([k, v]) => (
              <div key={k}><p className="text-xs font-bold uppercase text-ink-muted">{k}</p><p className="font-display text-2xl font-bold text-wood-800">{v}</p></div>
            ))}
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}
