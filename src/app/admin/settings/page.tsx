import type { Metadata } from "next";
import { PageHeader } from "@/components/admin/page-header";
import { getStoreSettings } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import type { PaymentMethod } from "@/lib/types";
import { PaymentMethods, SettingsForm } from "./settings-form";

export const metadata: Metadata = { title: "Store settings" };

export default async function SettingsPage() {
  const supabase = await createClient();
  const [settings, { data: methods }] = await Promise.all([getStoreSettings(), supabase.from("payment_methods").select("*").order("sort_order")]);
  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader title="Store settings" description="Store information, ordering, inventory and POS rules. Every change is recorded in the audit log." />
      <SettingsForm settings={settings} />
      <PaymentMethods methods={(methods ?? []) as PaymentMethod[]} />
    </div>
  );
}
