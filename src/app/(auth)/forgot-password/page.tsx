import { Phone } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { getStoreSettings } from "@/lib/data";

export const metadata: Metadata = { title: "Forgot password" };

/** Accounts have no email, so a forgotten password is reset by the store. */
export default async function ForgotPasswordPage() {
  const s = await getStoreSettings();
  return (
    <div className="space-y-4">
      <h1 className="font-display text-3xl font-extrabold text-forest-800">Forgot your password?</h1>
      <p className="text-ink-soft">
        Message or visit {s.store_name} with your <b>username</b> or <b>mobile number</b>. We&apos;ll give you a temporary password, and you can change it after logging in.
      </p>
      {s.phone ? (
        <a href={`tel:${s.phone.replace(/\s/g, "")}`} className="flex items-center gap-2 rounded-xl bg-cream-200/70 px-4 py-3 font-semibold text-forest-700">
          <Phone className="size-4" /> {s.phone}
        </a>
      ) : null}
      {s.address ? <p className="text-sm text-ink-muted">{s.address}</p> : null}
      <Link href="/login" className="block text-center text-sm font-semibold text-forest-700 hover:underline">Back to log in</Link>
    </div>
  );
}
