"use client";

import { Check, Loader2, Minus, Package, Plus, Printer, Search, Trash2, UserRound, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition, type CSSProperties } from "react";
import { mealKind } from "@/components/brand/meal-art";
import { useOverride } from "@/components/pos/override";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Alert } from "@/components/ui/feedback";
import { Checkbox, Field, Input, Select } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { peso } from "@/lib/format";
import { isSoldOut, servingsLeft, type Category, type PaymentMethod, type Product, type ServiceType } from "@/lib/types";
import { cn } from "@/lib/utils";
import { createPosSale, lookupRedemption, quotePos, searchCustomers, setAvailability, setStock, type PosQuote, type RedemptionLookup } from "./actions";

type Line = { key: string; product: Product; quantity: number; addons: Product[]; notes: string };
type Customer = { id: string; full_name: string; username: string | null; phone?: string; points_balance: number };

const EMOJI: Record<string, string> = {
  hotdog: "🌭", longganisa: "🌭", tocino: "🥓", chicken: "🍗", liempo: "🥓", porkchop: "🍖", sisig: "🍳",
  bangus: "🐟", fish: "🐟", egg: "🍳", rice: "🍚", gravy: "🥣", atchara: "🥗", drink: "🧋", water: "💧", default: "🍽️",
};

export function Register(props: {
  categories: Category[];
  products: Product[];
  addonLinks: [string, string][];
  methods: PaymentMethod[];
  packagingFee: number;
  maxDiscount: number;
  canDiscount: boolean;
}) {
  const { categories, products, addonLinks, methods } = props;
  const router = useRouter();
  const toast = useToast();
  const { run, dialog: overrideDialog } = useOverride();

  const [category, setCategory] = useState("all");
  const [query, setQuery] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [service, setService] = useState<ServiceType>("dine_in");
  const [method, setMethod] = useState(methods[0]?.code ?? "");
  const [tendered, setTendered] = useState("");
  const [reference, setReference] = useState("");
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [promo, setPromo] = useState("");
  const [rewardCode, setRewardCode] = useState("");
  const [reward, setReward] = useState<RedemptionLookup | null>(null);
  const [discount, setDiscount] = useState<{ type: "percent" | "fixed"; value: string; reason: string }>({ type: "percent", value: "", reason: "" });
  const [completeNow, setCompleteNow] = useState(false);
  const [notes, setNotes] = useState("");
  const [quoteResult, setQuoteResult] = useState<{ key: string; quote: PosQuote | null; error: string | null } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [customerDialog, setCustomerDialog] = useState(false);
  const [done, setDone] = useState<{ order_id: string; order_number: string; total: number; change: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, startSubmit] = useTransition();
  const saleKey = useRef(crypto.randomUUID());

  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const addonsFor = (id: string) => addonLinks.filter(([p]) => p === id).map(([, a]) => byId.get(a)).filter((p): p is Product => !!p);
  const selectedMethod = methods.find((m) => m.code === method);

  const menuCount = products.filter((p) => categories.some((c) => c.id === p.category_id)).length;
  const visible = products.filter((p) => {
    const cat = categories.find((c) => c.id === p.category_id);
    if (!cat) return false;
    if (category !== "all" && cat.id !== category) return false;
    return !query.trim() || p.name.toLowerCase().includes(query.trim().toLowerCase());
  });

  const items = useMemo(
    () => lines.map((l) => ({ product_id: l.product.id, quantity: l.quantity, addons: l.addons.map((a) => a.id), notes: l.notes })),
    [lines],
  );
  const appliedReward = reward?.found && reward.status === "issued" ? rewardCode.trim().toUpperCase() : "";

  // Server-side price check for promos/rewards (the database computes the real total)
  const quoteKey = JSON.stringify([items, service, method, promo, appliedReward]);
  const freshQuote = quoteResult?.key === quoteKey ? quoteResult : null;
  const quote = items.length ? freshQuote?.quote ?? null : null;
  const quoteError = items.length ? freshQuote?.error ?? null : null;
  useEffect(() => {
    if (items.length === 0 || !method) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      const res = await quotePos({ items, service_type: service, payment_method: method, promo_code: promo, redemption_code: appliedReward });
      if (cancelled) return;
      setQuoteResult({ key: quoteKey, quote: res.ok ? res.data : null, error: res.ok ? null : res.error });
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [items, service, method, promo, appliedReward, quoteKey]);

  useEffect(() => {
    saleKey.current = crypto.randomUUID();
  }, [items, service, method, promo, appliedReward, discount, customer, tendered, reference, completeNow]);

  // Packaging preview until the server quote arrives: per meal, add-on categories (drinks, extras) excluded
  const addonCats = new Set(categories.filter((c) => c.is_addon_category).map((c) => c.id));
  const localPackaging = service === "takeout" ? props.packagingFee * lines.reduce((s, l) => s + (addonCats.has(l.product.category_id) ? 0 : l.quantity), 0) : 0;
  const localSubtotal = lines.reduce((s, l) => s + (l.product.price + l.addons.reduce((a, x) => a + x.price, 0)) * l.quantity, 0);
  const base = quote ?? { subtotal: localSubtotal, packaging_fee: localPackaging, discount_total: 0, total: localSubtotal + localPackaging, discount_reason: "", points: 0 };
  const manualValue = Number(discount.value) || 0;
  const manualAmount = manualValue > 0 ? Math.min(base.subtotal - base.discount_total, discount.type === "percent" ? Math.round(base.subtotal * Math.min(manualValue, 100)) / 100 : manualValue) : 0;
  const total = Math.max(0, Math.round((base.total - manualAmount) * 100) / 100);
  const cash = Number(tendered) || 0;
  const change = selectedMethod?.is_cash ? cash - total : 0;

  // Servings already on this ticket for a product (meal lines + add-ons)
  const inTicket = (id: string) => lines.reduce((s, l) => s + (l.product.id === id ? l.quantity : 0) + (l.addons.some((a) => a.id === id) ? l.quantity : 0), 0);

  const addProduct = (p: Product) => {
    if (isSoldOut(p)) return;
    const left = servingsLeft(p);
    if (left !== null && inTicket(p.id) >= left) {
      toast.error(`Only ${left} ${p.name} left.`);
      return;
    }
    setLines((ls) => {
      const existing = ls.find((l) => l.product.id === p.id && l.addons.length === 0 && !l.notes);
      if (existing) return ls.map((l) => (l === existing ? { ...l, quantity: Math.min(20, l.quantity + 1) } : l));
      return [...ls, { key: crypto.randomUUID(), product: p, quantity: 1, addons: [], notes: "" }];
    });
  };

  const reset = () => {
    setLines([]);
    setTendered("");
    setReference("");
    setCustomer(null);
    setCustomerName("");
    setPromo("");
    setRewardCode("");
    setReward(null);
    setDiscount({ type: "percent", value: "", reason: "" });
    setNotes("");
    setCompleteNow(false);
    setService("dine_in");
    setError(null);
    saleKey.current = crypto.randomUUID();
  };

  const charge = () => {
    setError(null);
    startSubmit(async () => {
      const res = await run("apply_discount", (grant) =>
        createPosSale({
          items,
          service_type: service,
          payment_method: method,
          amount_tendered: selectedMethod?.is_cash ? cash : null,
          payment_reference: reference,
          customer_id: customer?.id ?? null,
          customer_name: customer ? customer.full_name : customerName,
          promo_code: promo,
          redemption_code: appliedReward,
          discount_type: manualValue > 0 ? discount.type : null,
          discount_value: manualValue > 0 ? manualValue : null,
          discount_reason: discount.reason,
          override_grant: grant,
          complete_now: completeNow,
          notes,
          idempotency_key: saleKey.current,
        }),
      );
      setConfirming(false);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setDone(res.data);
      toast.success(`Order ${res.data.order_number} saved.`);
      reset();
      router.refresh();
    });
  };

  const [stockFor, setStockFor] = useState<Product | null>(null);

  const editingLine = lines.find((l) => l.key === editing);
  const tenderReady = !selectedMethod?.is_cash || cash >= total;
  const refReady = !selectedMethod?.requires_reference || reference.trim().length >= 4;
  const discountReady = manualValue === 0 || discount.reason.trim().length > 0;
  const canCharge = lines.length > 0 && !!method && !quoteError && tenderReady && refReady && discountReady && !submitting;

  return (
    <div className="grid min-h-[calc(100dvh-3.5rem)] lg:h-[calc(100dvh-3.5rem)] lg:grid-cols-[1fr_340px] xl:grid-cols-[1fr_380px] 2xl:grid-cols-[1fr_420px] lg:grid-rows-[minmax(0,1fr)] lg:overflow-hidden">
      {overrideDialog}
      {/* Product picker */}
      <section className="flex min-w-0 flex-col border-r border-bamboo-300/50 lg:min-h-0">
        <div className="sticky top-14 z-20 space-y-2 border-b lg:static border-bamboo-300/50 bg-cream-100 p-3">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search products" className="pl-9" aria-label="Search products" />
          </label>
          <div className="scrollbar-none flex gap-1.5 overflow-x-auto lg:flex-wrap">
            {[{ id: "all", name: "All" }, ...categories].map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCategory(c.id)}
                className={cn("shrink-0 rounded-lg px-3 py-2 text-sm font-bold", category === c.id ? "bg-forest-800 text-cream-50" : "bg-cream-50 text-wood-700 ring-1 ring-bamboo-400/60")}
              >
                {c.name}
              </button>
            ))}
          </div>
        </div>
        <div
          className="grid content-start grid-cols-2 gap-2 p-3 sm:grid-cols-3 xl:grid-cols-4 lg:min-h-0 lg:flex-1 lg:auto-rows-[minmax(min-content,1fr)] lg:content-stretch lg:overflow-y-auto lg:[grid-template-rows:repeat(var(--rows-lg),minmax(min-content,1fr))] xl:[grid-template-rows:repeat(var(--rows-xl),minmax(min-content,1fr))]"
          // Same number of rows as the full menu (3 columns at lg, 4 at xl), so a filtered
          // list keeps normal-size tiles instead of stretching them to fill the screen
          style={{ "--rows-lg": Math.max(1, Math.ceil(menuCount / 3)), "--rows-xl": Math.max(1, Math.ceil(menuCount / 4)) } as CSSProperties}
        >
          {visible.map((p) => (
            <div key={p.id} className="relative">
              <button
                type="button"
                onClick={() => addProduct(p)}
                disabled={isSoldOut(p)}
                className={cn(
                  "flex h-28 w-full flex-col justify-between rounded-xl bg-cream-50 p-3 pr-9 text-left lg:h-full lg:flex-row lg:items-center lg:justify-start lg:gap-3 lg:py-2 lg:pr-10 ring-1 ring-bamboo-400/50 transition active:scale-[0.98]",
                  isSoldOut(p) ? "opacity-50" : "hover:ring-forest-600",
                )}
              >
                {p.pos_icon_url ? (
                  <Image src={p.pos_icon_url} alt="" width={160} height={160} sizes="80px" className="h-10 w-14 shrink-0 object-contain lg:h-12 lg:w-16 xl:h-14 xl:w-[4.5rem] 2xl:h-16 2xl:w-20" />
                ) : (
                  <span className="text-2xl lg:text-3xl xl:text-4xl 2xl:text-5xl" aria-hidden>{EMOJI[mealKind(p.slug, p.name)]}</span>
                )}
                <span className="min-w-0">
                  <span className="line-clamp-2 text-sm font-bold leading-tight text-wood-800 lg:text-base 2xl:text-lg">{p.name}</span>
                  <span className="flex items-baseline justify-between gap-1">
                    <span className="text-sm font-extrabold text-forest-700 lg:text-base 2xl:text-lg">{peso(p.price)}</span>
                    {isSoldOut(p) ? (
                      <span className="rounded bg-terracotta-600 px-1.5 text-[0.7rem] font-bold uppercase text-cream-50">Sold out</span>
                    ) : servingsLeft(p) !== null ? (
                      <span className={cn("text-xs font-bold", (servingsLeft(p) ?? 0) <= 5 ? "text-terracotta-600" : "text-ink-muted")}>{servingsLeft(p)} left</span>
                    ) : null}
                  </span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => setStockFor(p)}
                className="absolute right-1.5 top-1.5 rounded-md bg-cream-200/90 p-1 text-wood-600 hover:bg-cream-300"
                title="Stock / sold out"
                aria-label={`Stock for ${p.name}`}
              >
                <Package className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* Ticket */}
      <aside className="flex flex-col bg-cream-50 lg:min-h-0">
        <div className="flex items-center justify-between border-b border-bamboo-300/50 px-4 py-3">
          <h1 className="font-display text-xl font-bold text-wood-800">Current sale</h1>
          {lines.length > 0 ? <Button variant="ghost" size="sm" onClick={reset}><X /> Clear</Button> : null}
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {lines.length === 0 ? <p className="py-10 text-center text-sm text-ink-muted">Tap a product to start a sale.</p> : null}
          <ul className="space-y-2">
            {lines.map((l) => (
              <li key={l.key} className="rounded-xl bg-white/70 p-2.5 ring-1 ring-bamboo-300/50">
                <div className="flex items-start justify-between gap-2">
                  <button type="button" className="min-w-0 text-left" onClick={() => setEditing(l.key)}>
                    <span className="block font-bold leading-tight">{l.product.name}</span>
                    {l.addons.length ? <span className="block text-xs text-ink-muted">+ {l.addons.map((a) => a.name).join(", ")}</span> : null}
                    {l.notes ? <span className="block text-xs italic text-ink-muted">“{l.notes}”</span> : null}
                    <span className="text-xs font-semibold text-forest-700">{addonsFor(l.product.id).length ? "Add-ons / notes" : "Notes"}</span>
                  </button>
                  <span className="font-bold">{peso((l.product.price + l.addons.reduce((s, a) => s + a.price, 0)) * l.quantity)}</span>
                </div>
                <div className="mt-1.5 flex items-center justify-between">
                  <div className="flex items-center rounded-lg ring-1 ring-bamboo-400/60">
                    <button type="button" className="grid size-9 place-items-center" aria-label="Less" onClick={() => setLines((ls) => ls.flatMap((x) => (x.key === l.key ? (x.quantity > 1 ? [{ ...x, quantity: x.quantity - 1 }] : []) : [x])))}>
                      <Minus className="size-4" />
                    </button>
                    <span className="w-8 text-center font-bold">{l.quantity}</span>
                    <button type="button" className="grid size-9 place-items-center" aria-label="More" onClick={() => setLines((ls) => ls.map((x) => (x.key === l.key ? { ...x, quantity: Math.min(20, x.quantity + 1) } : x)))}>
                      <Plus className="size-4" />
                    </button>
                  </div>
                  <button type="button" aria-label="Remove line" className="rounded-lg p-2 text-terracotta-600 hover:bg-terracotta-100" onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}>
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>

          {lines.length > 0 ? (
            <div className="mt-4 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                {(["dine_in", "takeout"] as const).map((s) => (
                  <button key={s} type="button" onClick={() => setService(s)} className={cn("rounded-xl py-2.5 font-bold", service === s ? "bg-forest-800 text-cream-50" : "bg-white ring-1 ring-bamboo-400/60")}>
                    {s === "dine_in" ? "Dine-in" : "Takeout"}
                  </button>
                ))}
              </div>

              <div className="rounded-xl bg-white/70 p-3 ring-1 ring-bamboo-300/50">
                {customer ? (
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 text-sm"><UserRound className="mr-1 inline size-4" /><b>{customer.full_name}</b> · {customer.points_balance} pts</span>
                    <Button size="sm" variant="ghost" onClick={() => setCustomer(null)}>Unlink</Button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Customer name (optional)" className="h-10" maxLength={120} />
                    <Button size="sm" variant="outline" className="h-10" onClick={() => setCustomerDialog(true)}>Link account</Button>
                  </div>
                )}
              </div>

              <details className="rounded-xl bg-white/70 p-3 ring-1 ring-bamboo-300/50" open={!!(promo || rewardCode || discount.value)}>
                <summary className="cursor-pointer text-sm font-bold text-wood-700">Promo, reward code &amp; discount</summary>
                <div className="mt-3 space-y-3">
                  <div className="flex gap-2">
                    <Input value={rewardCode} onChange={(e) => { setRewardCode(e.target.value.toUpperCase()); setReward(null); }} placeholder="Reward code JK-XXXX-XXXX" className="h-10 font-mono" maxLength={20} />
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-10"
                      disabled={rewardCode.trim().length < 6}
                      onClick={async () => {
                        const res = await lookupRedemption(rewardCode);
                        if (!res.ok) return toast.error(res.error);
                        setReward(res.data);
                        if (res.data.found && res.data.status === "issued" && !customer && res.data.customer_id) {
                          setCustomer({ id: res.data.customer_id, full_name: res.data.customer_name ?? "", username: null, points_balance: 0 });
                        }
                      }}
                    >
                      Check
                    </Button>
                  </div>
                  {reward ? (
                    reward.found ? (
                      <p className={cn("text-sm", reward.status === "issued" ? "text-leaf-700" : "text-terracotta-600")}>
                        {reward.reward_name} for {reward.customer_name} — {reward.status === "issued" ? "valid, applied" : `can't use (${reward.status})`}
                      </p>
                    ) : (
                      <p className="text-sm text-terracotta-600">Code not found.</p>
                    )
                  ) : null}
                  <Input value={promo} onChange={(e) => setPromo(e.target.value.toUpperCase())} placeholder="Promo code" className="h-10" maxLength={20} />
                  <div className="grid grid-cols-[110px_1fr] gap-2">
                    <Select value={discount.type} onChange={(e) => setDiscount((d) => ({ ...d, type: e.target.value as "percent" | "fixed" }))} className="h-10">
                      <option value="percent">% off</option>
                      <option value="fixed">₱ off</option>
                    </Select>
                    <Input type="number" min={0} step="0.01" inputMode="decimal" value={discount.value} onChange={(e) => setDiscount((d) => ({ ...d, value: e.target.value }))} placeholder="Manual discount" className="h-10" />
                  </div>
                  {manualValue > 0 ? (
                    <Input value={discount.reason} onChange={(e) => setDiscount((d) => ({ ...d, reason: e.target.value }))} placeholder="Reason (required)" className="h-10" maxLength={200} />
                  ) : null}
                  {!props.canDiscount && manualValue > 0 ? <p className="text-xs text-ink-muted">Needs a manager PIN when you charge.</p> : null}
                  {props.canDiscount && manualValue > 0 ? <p className="text-xs text-ink-muted">Staff limit {props.maxDiscount}% — more needs an admin PIN.</p> : null}
                </div>
              </details>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Kitchen note (optional)" className="h-10" maxLength={500} />
            </div>
          ) : null}
        </div>

        {/* Totals and payment */}
        <div className="border-t border-bamboo-300/60 bg-cream-100 px-4 py-3">
          {quoteError ? <Alert tone="error" className="mb-2">{quoteError}</Alert> : null}
          {error ? <Alert tone="error" className="mb-2">{error}</Alert> : null}
          <dl className="space-y-0.5 text-sm">
            <div className="flex justify-between"><dt>Subtotal</dt><dd>{peso(base.subtotal)}</dd></div>
            {base.packaging_fee > 0 ? <div className="flex justify-between"><dt>Packaging</dt><dd>{peso(base.packaging_fee)}</dd></div> : null}
            {base.discount_total > 0 ? <div className="flex justify-between text-leaf-700"><dt>{base.discount_reason || "Discount"}</dt><dd>−{peso(base.discount_total)}</dd></div> : null}
            {manualAmount > 0 ? <div className="flex justify-between text-leaf-700"><dt>Manual discount</dt><dd>−{peso(manualAmount)}</dd></div> : null}
          </dl>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="font-bold">Total</span>
            <span className="font-display text-3xl font-extrabold text-forest-800">{peso(total)}</span>
          </div>
          {lines.length > 0 ? (
            <div className="mt-2 space-y-2">
              <div className="flex gap-1.5">
                {methods.map((m) => (
                  <button key={m.code} type="button" onClick={() => setMethod(m.code)} className={cn("flex-1 rounded-lg py-2 text-sm font-bold", method === m.code ? "bg-wood-600 text-cream-50" : "bg-white ring-1 ring-bamboo-400/60")}>
                    {m.name}
                  </button>
                ))}
              </div>
              {selectedMethod?.is_cash ? (
                <>
                  <Input type="number" inputMode="decimal" min={0} step="0.01" value={tendered} onChange={(e) => setTendered(e.target.value)} placeholder="Cash received" className="h-12 text-lg font-bold" aria-label="Cash received" />
                  <div className="flex gap-1.5">
                    {[total, 100, 200, 500, 1000].filter((v, i, a) => v >= total && a.indexOf(v) === i).slice(0, 4).map((v) => (
                      <button key={v} type="button" onClick={() => setTendered(String(v))} className="flex-1 rounded-lg bg-white py-1.5 text-sm font-bold ring-1 ring-bamboo-400/60">
                        {v === total ? "Exact" : `₱${v}`}
                      </button>
                    ))}
                  </div>
                  {cash > 0 ? (
                    <p className={cn("text-right font-bold", change >= 0 ? "text-leaf-700" : "text-terracotta-600")}>
                      {change >= 0 ? `Change ${peso(change)}` : `Short ${peso(-change)}`}
                    </p>
                  ) : null}
                </>
              ) : selectedMethod?.requires_reference ? (
                <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder={`${selectedMethod.name} reference no.`} className="h-11" maxLength={60} />
              ) : null}
              <Checkbox label="Served now (mark completed)" checked={completeNow} onChange={(e) => setCompleteNow(e.target.checked)} />
              <Button size="xl" className="w-full" disabled={!canCharge} onClick={() => setConfirming(true)}>
                Charge {peso(total)}
              </Button>
            </div>
          ) : null}
        </div>
      </aside>

      {/* Line editor */}
      <Dialog open={!!editingLine} onClose={() => setEditing(null)} title={editingLine?.product.name ?? ""} footer={<Button onClick={() => setEditing(null)}>Done</Button>}>
        {editingLine ? (
          <div className="space-y-3">
            {addonsFor(editingLine.product.id).map((a) => (
              <Checkbox
                key={a.id}
                label={`${a.name} (+${peso(a.price)})${isSoldOut(a) ? " — sold out" : ""}`}
                disabled={isSoldOut(a)}
                checked={editingLine.addons.some((x) => x.id === a.id)}
                onChange={(e) =>
                  setLines((ls) => ls.map((l) => (l.key === editingLine.key ? { ...l, addons: e.target.checked ? [...l.addons, a] : l.addons.filter((x) => x.id !== a.id) } : l)))
                }
              />
            ))}
            <Field label="Notes" htmlFor="line-notes">
              <Input id="line-notes" value={editingLine.notes} maxLength={200} onChange={(e) => setLines((ls) => ls.map((l) => (l.key === editingLine.key ? { ...l, notes: e.target.value } : l)))} />
            </Field>
          </div>
        ) : null}
      </Dialog>

      {stockFor ? (
        <StockDialog
          product={stockFor}
          onClose={() => setStockFor(null)}
          onSaved={(msg) => { setStockFor(null); toast.success(msg); router.refresh(); }}
        />
      ) : null}

      <CustomerSearch open={customerDialog} onClose={() => setCustomerDialog(false)} onPick={(c) => { setCustomer(c); setCustomerDialog(false); }} />

      {/* Confirm */}
      <Dialog
        open={confirming}
        onClose={() => !submitting && setConfirming(false)}
        title="Confirm sale"
        footer={
          <>
            <Button variant="outline" onClick={() => setConfirming(false)} disabled={submitting}>Back</Button>
            <Button onClick={charge} disabled={submitting}>{submitting ? <Loader2 className="animate-spin" /> : <Check />} Confirm &amp; save</Button>
          </>
        }
      >
        <ul className="space-y-1 text-sm">
          {lines.map((l) => <li key={l.key} className="flex justify-between"><span>{l.quantity} × {l.product.name}{l.addons.length ? ` (+${l.addons.length})` : ""}</span><span>{peso((l.product.price + l.addons.reduce((s, a) => s + a.price, 0)) * l.quantity)}</span></li>)}
        </ul>
        <dl className="mt-3 space-y-1 border-t border-bamboo-300/60 pt-3 text-sm">
          <div className="flex justify-between font-bold"><dt>Total ({service === "dine_in" ? "dine-in" : "takeout"})</dt><dd>{peso(total)}</dd></div>
          <div className="flex justify-between"><dt>Payment</dt><dd>{selectedMethod?.name}{selectedMethod?.is_cash ? ` · received ${peso(cash)}` : reference ? ` · ref ${reference}` : ""}</dd></div>
          {selectedMethod?.is_cash ? <div className="flex justify-between text-lg font-bold text-leaf-700"><dt>Change</dt><dd>{peso(change)}</dd></div> : null}
          {customer ? <div className="flex justify-between"><dt>Customer</dt><dd>{customer.full_name} (earns points)</dd></div> : null}
        </dl>
        <p className="mt-3 text-xs text-ink-muted">The server re-checks every price, code and discount when you confirm.</p>
      </Dialog>

      {/* Done */}
      <Dialog
        open={!!done}
        onClose={() => setDone(null)}
        title={`Order ${done?.order_number ?? ""}`}
        footer={
          <>
            <Link href={`/pos/receipt/${done?.order_id}`} className="inline-flex h-11 items-center gap-2 rounded-xl px-4 font-semibold text-wood-700 ring-1 ring-bamboo-400 hover:bg-cream-200" target="_blank">
              <Printer className="size-4" /> Receipt
            </Link>
            <Button onClick={() => setDone(null)}>Next customer</Button>
          </>
        }
      >
        {done ? (
          <div className="text-center">
            <p className="text-sm text-ink-muted">Total paid</p>
            <p className="font-display text-3xl font-extrabold text-forest-800">{peso(done.total)}</p>
            {done.change > 0 ? <p className="mt-2 text-2xl font-bold text-leaf-700">Change: {peso(done.change)}</p> : null}
          </div>
        ) : null}
      </Dialog>
    </div>
  );
}

function CustomerSearch({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (c: Customer) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);
  const searching = open && q.trim().length >= 2;
  const shown = searching ? results : [];
  useEffect(() => {
    if (!searching) return;
    const t = setTimeout(async () => {
      setLoading(true);
      const res = await searchCustomers(q);
      setLoading(false);
      if (res.ok) setResults(res.data);
    }, 250);
    return () => clearTimeout(t);
  }, [q, searching]);
  return (
    <Dialog open={open} onClose={onClose} title="Link a customer account" description="Points are added to the linked account when the order is completed.">
      <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, username or mobile" />
      <ul className="mt-3 divide-y divide-bamboo-300/40">
        {loading ? <li className="py-3 text-sm text-ink-muted">Searching…</li> : null}
        {!loading && searching && shown.length === 0 ? <li className="py-3 text-sm text-ink-muted">No customers found.</li> : null}
        {shown.map((c) => (
          <li key={c.id}>
            <button type="button" className="flex w-full items-center justify-between gap-3 py-2.5 text-left hover:bg-cream-200" onClick={() => onPick(c)}>
              <span><span className="font-semibold">{c.full_name || "(no name)"}</span><br /><span className="text-xs text-ink-muted">{[c.username ? `@${c.username}` : "", c.phone].filter(Boolean).join(" · ")}</span></span>
              <span className="text-sm font-bold text-gold-700">{c.points_balance} pts</span>
            </button>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}

/** Staff set servings for the day, restock, or switch an item off. */
function StockDialog({ product, onClose, onSaved }: { product: Product; onClose: () => void; onSaved: (msg: string) => void }) {
  const [track, setTrack] = useState(product.track_stock);
  const [qty, setQty] = useState(String(product.stock_quantity));
  const [available, setAvailable] = useState(product.is_available);
  const [error, setError] = useState<string | null>(null);
  const [busy, startSave] = useTransition();
  return (
    <Dialog
      open
      onClose={onClose}
      title={product.name}
      description="Servings stock goes down with every order. At 0 it shows Sold out on the menu and here."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={busy || (track && !(Number(qty) >= 0))}
            onClick={() =>
              startSave(async () => {
                setError(null);
                const s = await setStock(product.id, track, track ? Math.floor(Number(qty)) : 0);
                if (!s.ok) return setError(s.error);
                if (available !== product.is_available) {
                  const a = await setAvailability(product.id, available);
                  if (!a.ok) return setError(a.error);
                }
                onSaved(!available ? `${product.name} switched off.` : track ? `${product.name}: ${Math.floor(Number(qty))} servings.` : `${product.name}: no stock limit.`);
              })
            }
          >
            {busy ? <Loader2 className="animate-spin" /> : null} Save
          </Button>
        </>
      }
    >
      {error ? <Alert tone="error" className="mb-3">{error}</Alert> : null}
      <div className="space-y-4">
        <Checkbox label="Count servings for this item" checked={track} onChange={(e) => setTrack(e.target.checked)} />
        {track ? (
          <Field label="Servings left" htmlFor="stock-qty" hint="Set this at opening, and add to it when you cook more.">
            <div className="flex gap-2">
              <Input id="stock-qty" type="number" min={0} step={1} inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} className="h-11 text-lg font-bold" />
              {[10, 20].map((n) => (
                <Button key={n} variant="outline" onClick={() => setQty(String((Number(qty) || 0) + n))}>+{n}</Button>
              ))}
              <Button variant="outline" onClick={() => setQty("0")}>0</Button>
            </div>
          </Field>
        ) : null}
        <Checkbox label="Available (untick to mark sold out right away)" checked={available} onChange={(e) => setAvailable(e.target.checked)} />
      </div>
    </Dialog>
  );
}
