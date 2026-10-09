"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Alert } from "@/components/ui/feedback";
import { dateOnly } from "@/lib/format";
import { redeemReward } from "../actions";

export function RedeemButton({ rewardId, name, cost }: { rewardId: string; name: string; cost: number }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ code: string; expires_at: string } | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  const close = () => {
    setOpen(false);
    setError(null);
    if (result) router.refresh();
    setResult(null);
  };

  return (
    <>
      <Button size="sm" variant="gold" onClick={() => setOpen(true)}>Redeem</Button>
      <Dialog
        open={open}
        onClose={close}
        title={result ? "Enjoy your reward!" : `Redeem ${name}?`}
        description={result ? undefined : `This uses ${cost} points. You'll get a one-time code.`}
        footer={
          result ? (
            <Button onClick={close}>Done</Button>
          ) : (
            <>
              <Button variant="outline" onClick={close}>Not now</Button>
              <Button
                variant="gold"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const res = await redeemReward(rewardId);
                    if (res.ok) setResult(res.data);
                    else setError(res.error);
                  })
                }
              >
                {pending ? "Redeeming…" : `Use ${cost} points`}
              </Button>
            </>
          )
        }
      >
        {error ? <Alert tone="error">{error}</Alert> : null}
        {result ? (
          <div className="rounded-xl border-2 border-dashed border-forest-600/50 bg-leaf-50 p-5 text-center">
            <p className="text-sm text-ink-muted">Your code</p>
            <p className="font-mono text-3xl font-bold tracking-wider text-forest-800">{result.code}</p>
            <p className="mt-1 text-sm text-ink-muted">Valid until {dateOnly(result.expires_at)}. Show it at the counter or choose it at checkout.</p>
          </div>
        ) : null}
      </Dialog>
    </>
  );
}
