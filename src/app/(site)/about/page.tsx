import { Leaf, Sparkles, Users } from "lucide-react";
import type { Metadata } from "next";
import { KuboMark } from "@/components/brand/logo";
import { ButtonLink } from "@/components/ui/button";
import { getStoreSettings } from "@/lib/data";

export const metadata: Metadata = { title: "About" };

export default async function AboutPage() {
  const s = await getStoreSettings();
  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <div className="paper overflow-hidden">
        <div className="woven flex items-center gap-4 px-6 py-8">
          <KuboMark className="size-16" />
          <div>
            <h1 className="font-display text-4xl font-extrabold text-forest-800">About {s.store_name}</h1>
            <p className="text-ink-soft">{s.tagline}</p>
          </div>
        </div>
        <div className="space-y-4 p-6 text-[1.05rem] leading-relaxed text-ink-soft">
          {(s.about || "").split(/\n+/).filter(Boolean).map((p, i) => <p key={i}>{p}</p>)}
        </div>
      </div>
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        {[
          { icon: Sparkles, title: "Golden Java Rice", text: "Garlic, atsuete and margarine, fried fresh every batch." },
          { icon: Users, title: "Made for students", text: "Prices that fit an allowance, portions that fill you up." },
          { icon: Leaf, title: "Kubo hospitality", text: "Black trays, greaseproof paper, free iced tea — the kubo way." },
        ].map((f) => (
          <div key={f.title} className="paper p-5">
            <f.icon className="size-6 text-leaf-600" />
            <h2 className="mt-2 font-display text-lg font-bold text-wood-800">{f.title}</h2>
            <p className="text-sm text-ink-muted">{f.text}</p>
          </div>
        ))}
      </div>
      <div className="mt-8 flex justify-center">
        <ButtonLink href="/menu" size="lg">See the menu</ButtonLink>
      </div>
    </div>
  );
}
