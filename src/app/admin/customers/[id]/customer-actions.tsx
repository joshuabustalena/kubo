"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Alert } from "@/components/ui/feedback";
import { Field, Input } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { adjustPoints, adjustTokens, cancelRedemption, resetCustomerPassword } from "../../rewards/actions";

export function AdjustPoints({ customerId, kind = "points" }: { customerId: string; kind?: "points" | "tokens" }) {
  const label = kind === "points" ? "points" : "game tokens";
  const [open, setOpen] = useState(false);
  const [points, setPoints] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const router = useRouter();
  const toast = useToast();
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>Adjust {label}</Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={`Adjust ${label}`}
        description={`Adds a ledger entry with your name. Use a negative number to remove ${label}.`}
        footer={<>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button disabled={busy || !points || reason.trim().length < 3} onClick={() => start(async () => {
            const res = await (kind === "points" ? adjustPoints : adjustTokens)(customerId, Number(points), reason);
            if (!res.ok) return setError(res.error);
            toast.success(kind === "points" ? "Points adjusted." : "Tokens adjusted.");
            setOpen(false); setPoints(""); setReason("");
            router.refresh();
          })}>Save</Button>
        </>}
      >
        {error ? <Alert tone="error" className="mb-3">{error}</Alert> : null}
        <div className="space-y-3">
          <Field label={kind === "points" ? "Points (+/−)" : "Tokens (+/−)"} htmlFor="adj-p"><Input id="adj-p" type="number" step={1} value={points} onChange={(e) => setPoints(e.target.value)} /></Field>
          <Field label="Reason" htmlFor="adj-r"><Input id="adj-r" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} placeholder="e.g. Goodwill for late order" /></Field>
        </div>
      </Dialog>
    </>
  );
}

export function CancelCode({ id }: { id: string }) {
  const [busy, start] = useTransition();
  const router = useRouter();
  const toast = useToast();
  return (
    <Button size="sm" variant="ghost" disabled={busy} onClick={() => start(async () => {
      const reason = prompt("Reason for cancelling this code? Points will be returned.");
      if (!reason) return;
      const res = await cancelRedemption(id, reason);
      if (res.ok) toast.success("Code cancelled and points returned."); else toast.error(res.error);
      router.refresh();
    })}>Cancel code</Button>
  );
}

export function ResetPassword({ customerId }: { customerId: string }) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, start] = useTransition();
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => { setOpen(true); setDone(false); setError(null); setPassword(""); }}>Reset password</Button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Set a temporary password"
        description="For customers who forgot their password. Give it to them privately; they can change it under My account."
        footer={done ? <Button onClick={() => setOpen(false)}>Done</Button> : <>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button disabled={busy || password.length < 8} onClick={() => start(async () => {
            const res = await resetCustomerPassword(customerId, password);
            if (!res.ok) return setError(res.error);
            setDone(true);
          })}>Set password</Button>
        </>}
      >
        {error ? <Alert tone="error" className="mb-3">{error}</Alert> : null}
        {done ? (
          <Alert tone="success">Password updated. The customer can now log in with it.</Alert>
        ) : (
          <Field label="Temporary password" htmlFor="tmp-pw" hint="At least 8 characters.">
            <Input id="tmp-pw" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="off" />
          </Field>
        )}
      </Dialog>
    </>
  );
}
