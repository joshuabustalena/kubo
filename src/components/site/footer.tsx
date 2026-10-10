import { Clock, Globe, Mail, MapPin, Phone } from "lucide-react";
import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { InstallAppButton } from "@/components/pwa/install-app";
import { getStoreSettings } from "@/lib/data";

export async function SiteFooter() {
  const s = await getStoreSettings();
  return (
    <footer className="wood mt-16 no-print">
      <div className="bamboo-pole !rounded-none" role="presentation" />
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:grid-cols-2 lg:grid-cols-4 lg:px-11">
        <div className="space-y-3">
          <Logo light />
          <p className="text-sm text-bamboo-200">{s.tagline}</p>
          <InstallAppButton label="Install the app" className="rounded-xl bg-gold-400 px-4 py-2.5 text-sm font-bold text-wood-800 hover:bg-gold-300 [&_svg]:size-4" />
        </div>
        <div className="space-y-2 text-sm">
          <h2 className="font-display text-lg font-bold text-gold-300">Visit the kubo</h2>
          {s.address ? <p className="flex gap-2"><MapPin className="mt-0.5 size-4 shrink-0" />{s.address}</p> : null}
          {s.phone ? <p className="flex gap-2"><Phone className="mt-0.5 size-4 shrink-0" />{s.phone}</p> : null}
          {s.email ? <p className="flex gap-2"><Mail className="mt-0.5 size-4 shrink-0" />{s.email}</p> : null}
          {s.facebook_url ? (
            <a href={s.facebook_url} className="flex gap-2 hover:text-gold-300" rel="noopener noreferrer" target="_blank">
              <Globe className="mt-0.5 size-4 shrink-0" />Facebook
            </a>
          ) : null}
        </div>
        <div className="space-y-2 text-sm">
          <h2 className="font-display text-lg font-bold text-gold-300">Hours</h2>
          {s.opening_hours.map((h) => (
            <p key={h.days} className="flex gap-2"><Clock className="mt-0.5 size-4 shrink-0" /><span><span className="font-semibold">{h.days}</span><br />{h.hours}</span></p>
          ))}
        </div>
        <div className="space-y-2 text-sm">
          <h2 className="font-display text-lg font-bold text-gold-300">Explore</h2>
          <ul className="space-y-1.5">
            <li><Link className="hover:text-gold-300" href="/menu">Menu</Link></li>
            <li><Link className="hover:text-gold-300" href="/play">Play Zone</Link></li>
            <li><Link className="hover:text-gold-300" href="/account/rewards">Points &amp; rewards</Link></li>
            <li><Link className="hover:text-gold-300" href="/about">About Kainan sa Kubo</Link></li>
            <li><Link className="hover:text-gold-300" href="/contact">Contact</Link></li>
          </ul>
        </div>
      </div>
      <p className="border-t border-wood-500/40 py-4 text-center text-xs text-bamboo-300">
        © {new Date().getFullYear()} {s.store_name}. Prices in Philippine pesos (₱).
      </p>
    </footer>
  );
}
