import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { getPaymentMethods, getStoreSettings } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { CheckoutForm } from "./checkout-form";

export const metadata: Metadata = { title: "Checkout" };

export default async function CheckoutPage() {
  const user = await requireUser("/checkout");
  const supabase = await createClient();
  const [settings, methods, codes] = await Promise.all([
    getStoreSettings(),
    getPaymentMethods("online"),
    supabase
      .from("reward_redemptions")
      .select("code, expires_at, rewards(name)")
      .eq("customer_id", user.id)
      .eq("status", "issued")
      .gt("expires_at", new Date().toISOString())
      .order("expires_at"),
  ]);

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="font-display text-4xl font-extrabold text-forest-800">Checkout</h1>
      <CheckoutForm
        user={{ name: user.full_name, email: user.email, points: user.points_balance }}
        methods={methods}
        onlineEnabled={settings.online_ordering_enabled}
        packagingFee={settings.takeout_packaging_fee}
        rewardCodes={(codes.data ?? []).map((c) => ({
          code: c.code,
          name: (c.rewards as unknown as { name: string } | null)?.name ?? "Reward",
          expires_at: c.expires_at,
        }))}
      />
    </div>
  );
}
