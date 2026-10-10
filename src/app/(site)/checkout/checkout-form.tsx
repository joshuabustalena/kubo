"use client";

import { Loader2, ShoppingBag, Sparkles, Utensils } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Alert, EmptyState, PageLoading } from "@/components/ui/feedback";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { toOrderItems, useCart } from "@/lib/cart";
import { dateOnly, peso } from "@/lib/format";
import type { PaymentMethod, ServiceType } from "@/lib/types";
import { cn } from "@/lib/utils";
import { placeOrder, quoteCart, type Quote } from "./actions";

type Props = {
  user: { name: string; email: string; points: number };
  methods: PaymentMethod[];
  onlineEnabled: boolean;
  packagingFee: number;
  rewardCodes: { code: string; name: string; expires_at: string }[];
};

export function CheckoutForm({ user, methods, onlineEnabled, packagingFee, rewardCodes }: Props) {
  const cart = useCart();
  const router = useRouter();
  const [service, setService] = useState<ServiceType>("dine_in");
  const [method, setMethod] = useState(methods[0]?.code ?? "");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [promoInput, setPromoInput] = useState("");
  const [promo, setPromo] = useState("");
  const [rewardCode, setRewardCode] = useState("");
  const [result, setResult] = useState<{ key: string; quote: Quote | null; error: string | null } | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [placing, startPlacing] = useTransition();
  // One key per checkout attempt: retries/double clicks return the same order
  const idempotencyKey = useRef<string>(crypto.randomUUID());

  const items = useMemo(() => toOrderItems(cart.lines), [cart.lines]);
  const selected = methods.find((m) => m.code === method);

  // Server quote for exactly these inputs; while a new one loads, the old one is shown dimmed
  const requestKey = JSON.stringify([items, service, method, promo, rewardCode]);
  const fresh = result?.key === requestKey ? result : null;
  const quoting = !fresh;
  const quote = fresh ? fresh.quote : (result?.quote ?? null);
  const quoteError = fresh?.error ?? null;

  useEffect(() => {
    if (!cart.ready || items.length === 0 || !method) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      const res = await quoteCart({ items, service_type: service, payment_method: method, promo_code: promo, redemption_code: rewardCode });
      if (cancelled) return;
      setResult({ key: requestKey, quote: res.ok ? res.data : null, error: res.ok ? null : res.error });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [cart.ready, items, service, method, promo, rewardCode, requestKey]);

  // A changed order means a new attempt
  useEffect(() => {
    idempotencyKey.current = crypto.randomUUID();
  }, [items, service, method, promo, rewardCode]);

  if (!cart.ready) return <PageLoading label="Loading your tray…" />;
  if (cart.lines.length === 0) {
    return (
      <div className="paper mt-6">
        <EmptyState icon={<ShoppingBag />} title="Your tray is empty" action={<ButtonLink href="/menu">Browse the menu</ButtonLink>} />
      </div>
    );
  }

  const submit = () => {
    setSubmitError(null);
    startPlacing(async () => {
      const res = await placeOrder({
        items,
        service_type: service,
        payment_method: method,
        payment_reference: reference,
        notes,
        promo_code: promo,
        redemption_code: rewardCode,
        idempotency_key: idempotencyKey.current,
      });
      if (!res.ok) {
        setSubmitError(res.error);
        return;
      }
      cart.clear();
      router.push(`/orders/${res.data.order_id}?placed=1`);
    });
  };

  const canSubmit = onlineEnabled && !!fresh?.quote && !quoting && !placing && (!selected?.requires_reference || reference.trim().length >= 6);

  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_380px]">
      <div className="space-y-5">
        {!onlineEnabled ? (
          <Alert tone="warning" title="Online ordering is paused">Please order at the counter for now. Your tray is saved.</Alert>
        ) : null}

        <section className="paper p-5">
          <h2 className="font-display text-xl font-bold text-wood-800">How will you eat?</h2>
          <div className="mt-3 grid grid-cols-2 gap-3" role="radiogroup" aria-label="Service type">
            {([
              { value: "dine_in", label: "Dine-in", icon: Utensils, help: "Eat at the kubo" },
              { value: "takeout", label: "Takeout", icon: ShoppingBag, help: packagingFee > 0 ? `Pick up at the kubo · +${peso(packagingFee)} packaging per meal` : "Pick up at the kubo" },
            ] as const).map((o) => (
              <button
                key={o.value}
                type="button"
                role="radio"
                aria-checked={service === o.value}
                onClick={() => setService(o.value)}
                className={cn(
                  "flex flex-col items-start gap-1 rounded-xl border-2 p-4 text-left transition-colors",
                  service === o.value ? "border-forest-700 bg-leaf-50" : "border-bamboo-300 bg-cream-50 hover:bg-cream-200",
                )}
              >
                <o.icon className="size-5 text-forest-700" />
                <span className="font-bold">{o.label}</span>
                <span className="text-xs text-ink-muted">{o.help}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="paper p-5">
          <h2 className="font-display text-xl font-bold text-wood-800">Payment</h2>
          {methods.length === 0 ? (
            <Alert tone="error" className="mt-3">No payment methods are available online right now.</Alert>
          ) : (
            <div className="mt-3 space-y-2" role="radiogroup" aria-label="Payment method">
              {methods.map((m) => (
                <label key={m.code} className={cn("flex cursor-pointer gap-3 rounded-xl border-2 p-3.5", method === m.code ? "border-forest-700 bg-leaf-50" : "border-bamboo-300 bg-cream-50")}>
                  <input type="radio" name="method" value={m.code} checked={method === m.code} onChange={() => setMethod(m.code)} className="mt-1 accent-forest-700" />
                  <span>
                    <span className="font-bold">{m.name}</span>
                    {m.instructions ? <span className="block text-sm text-ink-muted">{m.instructions}</span> : null}
                  </span>
                </label>
              ))}
            </div>
          )}
          {selected?.requires_reference ? (
            <Field className="mt-4" label={`${selected.name} reference number`} htmlFor="ref" hint="We verify every digital payment before preparing your food.">
              <Input id="ref" inputMode="numeric" value={reference} onChange={(e) => setReference(e.target.value.replace(/[^0-9A-Za-z]/g, ""))} maxLength={30} placeholder="e.g. 1012345678901" />
            </Field>
          ) : null}
        </section>

        <section className="paper space-y-4 p-5">
          <h2 className="font-display text-xl font-bold text-wood-800">Discounts</h2>
          <Field label="Promo code" htmlFor="promo">
            <div className="flex gap-2">
              <Input id="promo" value={promoInput} onChange={(e) => setPromoInput(e.target.value.toUpperCase())} placeholder="e.g. BARKADA25" maxLength={20} />
              {promo ? (
                <Button variant="outline" onClick={() => { setPromo(""); setPromoInput(""); }}>Remove</Button>
              ) : (
                <Button variant="outline" disabled={!promoInput.trim()} onClick={() => setPromo(promoInput.trim())}>Apply</Button>
              )}
            </div>
          </Field>
          <Field label="Use a reward" htmlFor="reward" hint={rewardCodes.length === 0 ? "Redeem points for rewards in My Rewards." : undefined}>
            <Select id="reward" value={rewardCode} onChange={(e) => setRewardCode(e.target.value)} disabled={rewardCodes.length === 0}>
              <option value="">No reward</option>
              {rewardCodes.map((r) => (
                <option key={r.code} value={r.code}>{r.name} · {r.code} (until {dateOnly(r.expires_at)})</option>
              ))}
            </Select>
          </Field>
          <Field label="Order notes (optional)" htmlFor="order-notes">
            <Textarea id="order-notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} placeholder="Anything the kitchen should know?" className="min-h-16" />
          </Field>
        </section>
      </div>

      <aside className="lg:sticky lg:top-24 lg:self-start">
        <div className="paper p-5">
          <h2 className="font-display text-xl font-bold text-wood-800">Order summary</h2>
          <p className="text-sm text-ink-muted">For {user.name || user.email}</p>
          {quoteError ? <Alert tone="error" className="mt-3">{quoteError}</Alert> : null}
          {!quote && !quoteError ? (
            <p className="flex items-center gap-2 py-6 text-sm text-ink-muted"><Loader2 className="size-4 animate-spin" /> Checking prices…</p>
          ) : null}
          {quote ? (
            <div className={cn("mt-3 space-y-3", quoting && "opacity-60")}>
              <ul className="space-y-1.5 text-sm">
                {quote.lines.map((l, i) => (
                  <li key={i} className={cn("flex justify-between gap-3", l.is_addon && "pl-4 text-ink-muted")}>
                    <span>{l.quantity} × {l.name}</span>
                    <span>{peso(l.line_total)}</span>
                  </li>
                ))}
              </ul>
              <dl className="space-y-1 border-t border-bamboo-300/50 pt-3 text-sm">
                <div className="flex justify-between"><dt>Subtotal</dt><dd>{peso(quote.subtotal)}</dd></div>
                {quote.packaging_fee > 0 ? <div className="flex justify-between"><dt>Takeout packaging</dt><dd>{peso(quote.packaging_fee)}</dd></div> : null}
                {quote.discount_total > 0 ? (
                  <div className="flex justify-between text-leaf-700"><dt>Discount {quote.discount_reason ? `(${quote.discount_reason})` : ""}</dt><dd>−{peso(quote.discount_total)}</dd></div>
                ) : null}
                <div className="flex justify-between pt-1 text-lg font-bold"><dt>Total</dt><dd className="font-display text-2xl text-forest-700">{peso(quote.total)}</dd></div>
              </dl>
              {quote.points > 0 ? (
                <p className="flex items-center gap-2 rounded-lg bg-gold-100 px-3 py-2 text-sm font-semibold text-gold-700">
                  <Sparkles className="size-4" /> You&apos;ll earn {quote.points} points{quote.tokens > 0 ? ` and ${quote.tokens} game token${quote.tokens === 1 ? "" : "s"}` : ""} when this order is completed.
                </p>
              ) : null}
            </div>
          ) : null}
          {submitError ? <Alert tone="error" className="mt-3">{submitError}</Alert> : null}
          <Button size="lg" className="mt-4 w-full" disabled={!canSubmit} onClick={submit}>
            {placing ? <Loader2 className="animate-spin" /> : null}
            {placing ? "Placing order…" : quote ? `Place order · ${peso(quote.total)}` : "Place order"}
          </Button>
          {selected?.is_cash ? <p className="mt-2 text-center text-xs text-ink-muted">Pay when you pick up at the counter.</p> : null}
        </div>
      </aside>
    </div>
  );
}
