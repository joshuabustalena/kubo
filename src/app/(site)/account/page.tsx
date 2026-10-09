import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { formatPhone, isInternalEmail } from "@/lib/account";
import { dateOnly } from "@/lib/format";
import { ProfileForm } from "./profile-form";

export const metadata: Metadata = { title: "My account" };

export default async function AccountPage() {
  const user = await requireUser("/account");
  return (
    <div className="grid gap-6 md:grid-cols-[1fr_300px]">
      <ProfileForm user={{ full_name: user.full_name, phone: user.phone, student_school: user.student_school }} />
      <aside className="paper h-fit space-y-3 p-5 text-sm">
        <h2 className="font-display text-lg font-bold text-wood-800">Account</h2>
        {user.username ? <p><span className="text-ink-muted">Username</span><br /><span className="font-semibold">@{user.username}</span></p> : null}
        {user.phone ? <p><span className="text-ink-muted">Mobile number</span><br /><span className="font-semibold">{formatPhone(user.phone)}</span></p> : null}
        {!isInternalEmail(user.email) ? <p><span className="text-ink-muted">Email</span><br /><span className="font-semibold">{user.email}</span></p> : null}
        <p><span className="text-ink-muted">Member since</span><br /><span className="font-semibold">{dateOnly(user.created_at)}</span></p>
        <Link href="/reset-password" className="inline-block font-semibold text-forest-700 hover:underline">Change password</Link>
      </aside>
    </div>
  );
}
