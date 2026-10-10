import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

/** The Kainan sa Kubo emblem (public/brand/kubo-emblem.png, cut out from public/Image/Tropical Kainan sa Kubo Emblem.png). */
export function KuboMark({ className, eager = false }: { className?: string; eager?: boolean }) {
  return (
    <Image
      src="/brand/kubo-emblem.png"
      alt=""
      width={512}
      height={512}
      sizes="96px"
      loading={eager ? "eager" : undefined}
      className={cn("size-10 shrink-0 object-contain", className)}
    />
  );
}

/** compact: on phones show only the emblem (it already spells out the name); the words appear from sm up. */
export function Logo({ className, light = false, href = "/", compact = false }: { className?: string; light?: boolean; href?: string; compact?: boolean }) {
  return (
    <Link href={href} className={cn("inline-flex items-center gap-2.5", className)} aria-label="Kainan sa Kubo home">
      <KuboMark className={compact ? "size-14" : "size-12 sm:size-14"} eager />
      <span className={cn("leading-none", compact && "hidden sm:block")}>
        <span className={cn("block font-display text-[1.2rem] font-extrabold tracking-tight sm:text-[1.45rem]", light ? "text-cream-50" : "text-forest-800")}>
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
