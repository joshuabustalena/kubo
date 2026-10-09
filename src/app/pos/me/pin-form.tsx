"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/feedback";
import { Field, Input } from "@/components/ui/form";
import { setMyPin } from "../actions";

export function PinForm({ hasPin }: { hasPin: boolean }) {
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [busy, start] = useTransition();
  return (
    <form
      className="max-w-sm space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (pin !== confirm) return setMsg({ tone: "error", text: "PINs do not match." });
        start(async () => {
          const res = await setMyPin(pin);
          setMsg(res.ok ? { tone: "success", text: "PIN saved." } : { tone: "error", text: res.error });
          if (res.ok) { setPin(""); setConfirm(""); }
        });
      }}
    >
      {hasPin ? <p className="text-sm text-leaf-700">You have a PIN set. Enter a new one to change it.</p> : null}
      {msg ? <Alert tone={msg.tone}>{msg.text}</Alert> : null}
      <Field label="New PIN (4–8 digits)" htmlFor="pin">
        <Input id="pin" type="password" inputMode="numeric" autoComplete="new-password" value={pin} maxLength={8} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} />
      </Field>
      <Field label="Confirm PIN" htmlFor="pin2">
        <Input id="pin2" type="password" inputMode="numeric" autoComplete="new-password" value={confirm} maxLength={8} onChange={(e) => setConfirm(e.target.value.replace(/\D/g, ""))} />
      </Field>
      <Button type="submit" disabled={busy || pin.length < 4}>Save PIN</Button>
    </form>
  );
}
