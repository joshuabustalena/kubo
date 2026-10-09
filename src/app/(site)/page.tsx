import { ArrowRight, Coins, Gamepad2, Gift, Ticket, Utensils } from "lucide-react";
import Link from "next/link";
import { ProductImage } from "@/components/brand/meal-art";
import { ProductCard } from "@/components/site/product-card";
import { ButtonLink } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { getActivePromotions, getMenu, getStoreSettings } from "@/lib/data";
import { peso } from "@/lib/format";

export default async function HomePage(props: PageProps<"/">) {
  const sp = await props.searchParams;
  const [settings, menu, promos] = await Promise.all([getStoreSettings(), getMenu(), getActivePromotions()]);
  const featured = menu.products.filter((p) => p.is_featured && !p.is_addon).slice(0, 6);
  const heroProduct = featured.find((p) => p.slug === "java-toc") ?? featured[0];

  return (
    <>
      {sp.denied ? (
        <div className="mx-auto max-w-6xl px-4 pt-4">
          <Alert tone="warning" title="That area is for Kainan sa Kubo staff only." />
        </div>
      ) : null}

      <section className="woven border-b border-bamboo-400/40">
        <div className="mx-auto grid max-w-6xl items-center gap-8 px-4 py-10 md:grid-cols-[1.1fr_1fr] md:py-16">
          <div>
            <p className="mb-3 inline-flex items-center gap-2 rounded-full bg-cream-50/80 px-3 py-1 text-xs font-bold uppercase tracking-widest text-wood-600">
              <Utensils className="size-3.5" /> Student-friendly kubo eatery
            </p>
            <h1 className="font-display text-4xl font-extrabold leading-[1.05] text-forest-800 sm:text-5xl md:text-6xl">
              Golden Java Rice,<br />
              <span className="text-wood-600">sulit</span> every day.
            </h1>
            <p className="mt-4 max-w-lg text-lg text-ink-soft">
              {settings.tagline} Every meal comes on a black tray with greaseproof paper and a free cup of iced tea.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <ButtonLink href="/menu" size="lg">Order now <ArrowRight /></ButtonLink>
              <ButtonLink href="/play" size="lg" variant="outline"><Gamepad2 /> Play Zone</ButtonLink>
            </div>
            {!settings.online_ordering_enabled ? (
              <Alert tone="warning" className="mt-5 max-w-lg" title="Online ordering is paused right now.">
                You can still browse the menu and order at the counter.
              </Alert>
            ) : null}
          </div>
          {heroProduct ? (
            <Link href={`/menu/${heroProduct.slug}`} className="paper relative mx-auto block w-full max-w-md overflow-hidden rotate-1 transition-transform hover:rotate-0">
              <ProductImage src={heroProduct.image_url} slug={heroProduct.slug} name={heroProduct.name} priority sizes="(max-width: 768px) 100vw, 40vw" />
              <div className="flex items-center justify-between p-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-bamboo-600">Bestseller</p>
                  <p className="font-display text-xl font-bold text-wood-800">{heroProduct.name}</p>
                </div>
                <p className="font-display text-2xl font-extrabold text-forest-700">{peso(heroProduct.price)}</p>
              </div>
            </Link>
          ) : null}
        </div>
      </section>

      {/* Points explainer */}
      {settings.points_enabled ? (
        <section className="mx-auto max-w-6xl px-4 py-10">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="paper flex items-start gap-4 p-5">
              <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-gold-100 text-gold-700"><Coins /></span>
              <div>
                <h2 className="font-display text-xl font-bold text-wood-800">Earn on every meal</h2>
                <p className="text-sm text-ink-muted">
                  Meals {peso(settings.points_price_threshold)} and below earn <b>{settings.points_at_or_below} point</b>; meals above earn{" "}
                  <b>{settings.points_above} points</b>. Three ₱70 meals = 6 points.
                </p>
              </div>
            </div>
            <div className="paper flex items-start gap-4 p-5">
              <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-leaf-50 text-leaf-700"><Gift /></span>
              <div>
                <h2 className="font-display text-xl font-bold text-wood-800">Trade points for treats</h2>
                <p className="text-sm text-ink-muted">Free drinks, discounts and free meals in the rewards catalogue.</p>
                <Link href="/account/rewards" className="text-sm font-semibold text-forest-700 hover:underline">See rewards →</Link>
              </div>
            </div>
            <div className="paper flex items-start gap-4 p-5">
              <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-terracotta-100 text-terracotta-600"><Gamepad2 /></span>
              <div>
                <h2 className="font-display text-xl font-bold text-wood-800">Play for bonus points</h2>
                <p className="text-sm text-ink-muted">Every meal also earns game tokens for the Play Zone. Totally optional — just for fun.</p>
                <Link href="/play" className="text-sm font-semibold text-forest-700 hover:underline">Play now →</Link>
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {/* Featured */}
      <section className="mx-auto max-w-6xl px-4 py-6">
        <div className="mb-5 flex items-end justify-between gap-4">
          <div>
            <h2 className="font-display text-3xl font-extrabold text-forest-800">Kubo favourites</h2>
            <p className="text-ink-muted">The meals students keep coming back for.</p>
          </div>
          <ButtonLink href="/menu" variant="outline" size="sm">Full menu <ArrowRight /></ButtonLink>
        </div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {featured.map((p) => (
            <ProductCard key={p.id} product={p} rules={settings} />
          ))}
        </div>
      </section>

      {/* Promotions */}
      {promos.length > 0 ? (
        <section className="mx-auto max-w-6xl px-4 py-10">
          <h2 className="mb-4 font-display text-3xl font-extrabold text-forest-800">Current promos</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {promos.map((p) => (
              <div key={p.id} className="paper flex items-start gap-4 border-dashed p-5">
                <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-forest-800 text-gold-300"><Ticket /></span>
                <div className="min-w-0">
                  <h3 className="font-display text-xl font-bold text-wood-800">{p.name}</h3>
                  <p className="text-sm text-ink-muted">{p.description}</p>
                  {p.code ? (
                    <p className="mt-2 text-sm">
                      Use code <span className="rounded-md bg-cream-200 px-2 py-0.5 font-mono font-bold text-wood-700">{p.code}</span>
                      {p.applies_online ? " at checkout" : " at the counter"}
                    </p>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}
