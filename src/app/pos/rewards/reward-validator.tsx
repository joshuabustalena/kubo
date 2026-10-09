"use client";

import { Loader2, Search } from "lucide-react";
import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { Input } from "@/components/ui/form";
import { dateOnly, dateTime, peso } from "@/lib/format";
import { lookupRedemption, redeemAtCounter, type RedemptionLookup } from "../actions";

export function RewardValidator() {
  const [code, setCode] = useState("");
  const [info, setInfo] = useState<RedemptionLookup | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, start] = useTransition();

  const check = () =>
    start(async () => {
      setError(null);
      setMessage(null);
      const res = await lookupRedemption(code);
      if (!res.ok) return setError(res.error);
      setInfo(res.data);
    });

  const describe = (r: RedemptionLookup) =>
    r.reward_type === "free_product" ? `Free ${r.product_name}` : r.reward_type === "fixed_discount" ? `${peso(r.value)} off` : `${r.value}% off`;

  return (
    <div className="space-y-4">
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); check(); }}>
        <Input value={code} onChange={(e) => { setCode(e.target.value.toUpperCase()); setInfo(null); }} placeholder="JK-XXXX-XXXX" className="h-12 font-mono text-lg" autoFocus maxLength={20} />
        <Button type="submit" size="lg" disabled={busy || code.trim().length < 6}>{busy ? <Loader2 className="animate-spin" /> : <Search />} Check</Button>
      </form>
      {error ? <Alert tone="error">{error}</Alert> : null}
      {message ? <Alert tone="success">{message}</Alert> : null}
      {info ? (
        info.found ? (
          <div className="paper space-y-2 p-5">
            <div className="flex items-center justify-between gap-2">
              <p className="font-display text-xl font-bold text-wood-800">{info.reward_name}</p>
              <Badge tone={info.status === "issued" ? "green" : "red"}>{info.status === "issued" ? "Valid" : info.status}</Badge>
            </div>
            <p className="text-sm">{describe(info)} · for <b>{info.customer_name}</b></p>
            <p className="text-sm text-ink-muted">
              {info.status === "used" ? `Used ${dateTime(info.used_at)}${info.order_number ? ` on order ${info.order_number}` : ""}` : `Valid until ${dateOnly(info.expires_at)}`}
            </p>
            {info.status === "issued" ? (
              <Button
                variant="gold"
                disabled={busy}
                onClick={() =>
                  start(async () => {
                    const res = await redeemAtCounter(info.code!, "Handed over at counter");
                    if (!res.ok) return setError(res.error);
                    setMessage(`${info.reward_name} handed over. Code ${info.code} is now used.`);
                    setInfo({ ...info, status: "used", used_at: new Date().toISOString() });
                  })
                }
              >
                Mark as used (no sale)
              </Button>
            ) : null}
          </div>
        ) : (
          <Alert tone="error">No reward with that code.</Alert>
        )
      ) : null}
    </div>
  );
}
