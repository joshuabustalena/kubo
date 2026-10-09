import { Clock, Globe, Mail, MapPin, Phone } from "lucide-react";
import type { Metadata } from "next";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { getPaymentMethods, getStoreSettings } from "@/lib/data";
import { peso } from "@/lib/format";

export const metadata: Metadata = { title: "Contact & store info" };

export default async function ContactPage() {
  const [s, methods] = await Promise.all([getStoreSettings(), getPaymentMethods("online")]);
  const rows = [
    { icon: MapPin, label: "Address", value: s.address },
    { icon: Phone, label: "Phone / Viber", value: s.phone, href: s.phone ? `tel:${s.phone.replace(/\s/g, "")}` : undefined },
    { icon: Mail, label: "Email", value: s.email, href: s.email ? `mailto:${s.email}` : undefined },
    { icon: Globe, label: "Facebook", value: s.facebook_url ? "Message us on Facebook" : "", href: s.facebook_url || undefined },
  ].filter((r) => r.value);

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <h1 className="font-display text-4xl font-extrabold text-forest-800">Visit the kubo</h1>
      <p className="text-ink-muted">Dine in, take out, or order ahead online and pick up at the counter.</p>
      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader title="Contact" />
          <CardBody className="space-y-4">
            {rows.map((r) => (
              <div key={r.label} className="flex gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-cream-200 text-wood-600"><r.icon className="size-5" /></span>
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-bamboo-600">{r.label}</p>
                  {r.href ? (
                    <a href={r.href} className="font-semibold text-forest-700 hover:underline" {...(r.href.startsWith("http") ? { target: "_blank", rel: "noopener noreferrer" } : {})}>{r.value}</a>
                  ) : (
                    <p className="font-semibold">{r.value}</p>
                  )}
                </div>
              </div>
            ))}
            {s.map_url ? (
              <a href={s.map_url} target="_blank" rel="noopener noreferrer" className="inline-block font-semibold text-forest-700 hover:underline">Open in Google Maps →</a>
            ) : null}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Store hours" />
          <CardBody className="space-y-3">
            {s.opening_hours.map((h) => (
              <div key={h.days} className="flex items-center justify-between gap-3 border-b border-bamboo-300/40 pb-2 last:border-0">
                <span className="flex items-center gap-2 font-semibold"><Clock className="size-4 text-bamboo-600" />{h.days}</span>
                <span className="text-ink-soft">{h.hours}</span>
              </div>
            ))}
          </CardBody>
        </Card>
        <Card className="md:col-span-2">
          <CardHeader title="Ordering & payment" />
          <CardBody className="grid gap-4 text-sm sm:grid-cols-2">
            <div>
              <p className="font-semibold">Online ordering</p>
              <p className="text-ink-muted">
                {s.online_ordering_enabled ? "Open — log in, add meals to your tray and pick up at the counter." : "Paused right now. Please order at the counter."}
                {s.takeout_packaging_fee > 0 ? ` Takeout orders include a ${peso(s.takeout_packaging_fee)} packaging fee.` : ""}
              </p>
            </div>
            <div>
              <p className="font-semibold">We accept</p>
              <ul className="text-ink-muted">
                {methods.map((m) => <li key={m.code}>{m.name}{m.instructions ? ` — ${m.instructions}` : ""}</li>)}
              </ul>
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
