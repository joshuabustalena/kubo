"use client";

import { Search, SearchX } from "lucide-react";
import { useMemo, useState } from "react";
import { ProductCard } from "@/components/site/product-card";
import { EmptyState } from "@/components/ui/feedback";
import { Input } from "@/components/ui/form";
import type { Menu } from "@/lib/data";
import type { PointsRules } from "@/lib/points";
import { cn } from "@/lib/utils";

export function MenuBrowser({ menu, rules, initialCategory }: { menu: Menu; rules: PointsRules; initialCategory?: string }) {
  const [category, setCategory] = useState<string>(initialCategory ?? "all");
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return menu.products.filter((p) => {
      const cat = menu.categories.find((c) => c.id === p.category_id);
      if (category !== "all" && cat?.slug !== category) return false;
      if (!q) return true;
      return `${p.name} ${p.description} ${cat?.name ?? ""}`.toLowerCase().includes(q);
    });
  }, [menu, category, query]);

  const grouped = menu.categories
    .map((c) => ({ category: c, products: filtered.filter((p) => p.category_id === c.id) }))
    .filter((g) => g.products.length > 0);

  return (
    <div>
      <div className="sticky top-[69px] z-30 -mx-4 border-b border-bamboo-300/40 bg-cream-100/95 px-4 pb-3 pt-3 backdrop-blur">
        <label className="relative block">
          <span className="sr-only">Search the menu</span>
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-muted" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search sisig, liempo, drinks…" className="pl-10" type="search" />
        </label>
        <div className="scrollbar-none mt-3 flex gap-2 overflow-x-auto" role="tablist" aria-label="Categories">
          {[{ slug: "all", name: "All" }, ...menu.categories].map((c) => (
            <button
              key={c.slug}
              type="button"
              role="tab"
              aria-selected={category === c.slug}
              onClick={() => setCategory(c.slug)}
              className={cn(
                "shrink-0 rounded-full border px-4 py-1.5 text-sm font-semibold transition-colors",
                category === c.slug ? "border-forest-800 bg-forest-800 text-cream-50" : "border-bamboo-400/70 bg-cream-50 text-wood-700 hover:bg-cream-200",
              )}
            >
              {c.name}
            </button>
          ))}
        </div>
      </div>

      {grouped.length === 0 ? (
        <EmptyState icon={<SearchX />} title="No meals match that search">Try another word or pick a different category.</EmptyState>
      ) : (
        <div className="space-y-10 pt-6">
          {grouped.map(({ category: c, products }, gi) => (
            <section key={c.id} aria-labelledby={`cat-${c.slug}`}>
              <h2 id={`cat-${c.slug}`} className="font-display text-2xl font-extrabold text-forest-800">{c.name}</h2>
              {c.description ? <p className="mb-4 text-sm text-ink-muted">{c.description}</p> : null}
              <div className="grid gap-3 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3">
                {products.map((p, i) => (
                  <ProductCard key={p.id} product={p} rules={rules} priority={gi === 0 && i < 3} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
