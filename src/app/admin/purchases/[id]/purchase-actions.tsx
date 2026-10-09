"use client";

import { PackageCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { cancelPurchase, receivePurchase } from "../../inventory/actions";

export function PurchaseActions({ id }: { id: string }) {
  const [busy, start] = useTransition();
  const router = useRouter();
  const toast = useToast();
  return (
    <div className="flex gap-2">
      <Button disabled={busy} onClick={() => start(async () => {
        const res = await receivePurchase(id);
        if (res.ok) toast.success("Stock received."); else toast.error(res.error);
        router.refresh();
      })}><PackageCheck /> Mark received &amp; add stock</Button>
      <Button variant="ghost" className="text-terracotta-600" disabled={busy} onClick={() => start(async () => {
        const reason = prompt("Why is this purchase cancelled?");
        if (!reason) return;
        const res = await cancelPurchase(id, reason);
        if (res.ok) toast.success("Purchase cancelled."); else toast.error(res.error);
        router.refresh();
      })}>Cancel purchase</Button>
    </div>
  );
}
