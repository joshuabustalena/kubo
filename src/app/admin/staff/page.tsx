import type { Metadata } from "next";
import { PageHeader } from "@/components/admin/page-header";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/types";
import { StaffManager } from "./staff-manager";

export const metadata: Metadata = { title: "Staff & access" };

export default async function StaffPage() {
  const me = (await getCurrentUser())!;
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("*").in("role", ["admin", "staff"]).order("role").order("full_name");
  return (
    <div className="max-w-5xl">
      <PageHeader
        title="Staff & access"
        description="Staff use the POS only. Give extra permissions sparingly — anything a cashier can't do needs a manager or admin PIN, and every approval is logged."
      />
      <StaffManager staff={(data ?? []) as Profile[]} meId={me.id} canCreate={Boolean(process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY)} />
    </div>
  );
}
