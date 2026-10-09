import Link from "next/link";
import { cn } from "@/lib/utils";

/** Bahay kubo mark: thatched roof, bamboo stilts, a bowl of golden rice in the window. */
export function KuboMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={cn("size-10", className)} aria-hidden>
      <path d="M24 4 3 22h42L24 4Z" fill="#8a5a35" />
      <path d="M24 4 3 22h42L24 4Z" fill="url(#thatch)" opacity=".55" />
      <path d="M7 22h34v14H7z" fill="#e8d3a6" />
      <path d="M7 22h34v14H7z" fill="url(#weave)" />
      <rect x="18" y="25" width="12" height="8" rx="1.5" fill="#1f3d2b" />
      <path d="M19.5 30.5a4.5 3 0 0 0 9 0Z" fill="#e8b53a" />
      <circle cx="22.5" cy="29.6" r=".6" fill="#fdf9f1" />
      <circle cx="25.6" cy="29.2" r=".6" fill="#fdf9f1" />
      <path d="M9 36v8M17 36v8M31 36v8M39 36v8" stroke="#b08d57" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M5 38.5h38" stroke="#8f7043" strokeWidth="1.6" strokeLinecap="round" />
      <defs>
        <pattern id="thatch" width="3" height="3" patternUnits="userSpaceOnUse" patternTransform="rotate(-30)">
          <path d="M0 0v3" stroke="#3e2614" strokeWidth="1" />
        </pattern>
        <pattern id="weave" width="4" height="4" patternUnits="userSpaceOnUse">
          <path d="M0 2h4M2 0v4" stroke="#c9a66b" strokeWidth=".8" />
        </pattern>
      </defs>
    </svg>
  );
}

export function Logo({ className, light = false, href = "/" }: { className?: string; light?: boolean; href?: string }) {
  return (
    <Link href={href} className={cn("inline-flex items-center gap-2.5", className)} aria-label="Kainan sa Kubo home">
      <KuboMark />
      <span className="leading-none">
        <span className={cn("block font-display text-[1.45rem] font-extrabold tracking-tight", light ? "text-cream-50" : "text-forest-800")}>
          Kainan sa <span className={light ? "text-gold-300" : "text-wood-600"}>Kubo</span>
        </span>
        <span className={cn("block text-[0.62rem] font-semibold uppercase tracking-[0.2em]", light ? "text-bamboo-200" : "text-bamboo-600")}>
          Java Rice Meals
        </span>
      </span>
    </Link>
  );
}

export function BambooDivider({ className }: { className?: string }) {
  return <div className={cn("bamboo-pole", className)} role="presentation" />;
}
