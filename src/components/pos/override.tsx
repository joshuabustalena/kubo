"use client";

import { KeyRound, Loader2 } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { requestOverride } from "@/app/pos/actions";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Alert } from "@/components/ui/feedback";
import { Field, Input } from "@/components/ui/form";
import type { ActionResult } from "@/lib/errors";

type Pending = { permission: string; reason: string; resolve: (grant: string | null) => void };

/**
 * Runs a sensitive action; if the database answers AUTH_REQUIRED, asks a
 * manager/admin for their PIN, then retries once with the single-use grant.
 */
export function useOverride() {
  const [pending, setPending] = useState<Pending | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const resolver = useRef<Pending | null>(null);

  const askPin = (permission: string, reason: string) =>
    new Promise<string | null>((resolve) => {
      const p = { permission, reason, resolve };
      resolver.current = p;
      setPin("");
      setError(null);
      setPending(p);
    });

  const run = useCallback(
    async <T,>(permission: string, action: (grant: string | null) => Promise<ActionResult<T>>): Promise<ActionResult<T>> => {
      const first = await action(null);
      if (first.ok || !first.auth) return first;
      const grant = await askPin(first.auth === "admin" ? "admin" : permission, first.error);
      if (!grant) return { ok: false, error: "Cancelled — no manager approval." };
      return action(grant);
    },
    [],
  );

  const close = (grant: string | null) => {
    resolver.current?.resolve(grant);
    resolver.current = null;
    setPending(null);
  };

  const dialog = (
    <Dialog
      open={!!pending}
      onClose={() => close(null)}
      title="Manager approval needed"
      description={pending?.reason}
      footer={
        <>
          <Button variant="outline" onClick={() => close(null)}>Cancel</Button>
          <Button
            disabled={checking || pin.length < 4}
            onClick={async () => {
              if (!pending) return;
              setChecking(true);
              const res = await requestOverride(pending.permission, pin);
              setChecking(false);
              if (!res.ok) {
                setError(res.error);
                setPin("");
                return;
              }
              close(res.data.grant_id);
            }}
          >
            {checking ? <Loader2 className="animate-spin" /> : <KeyRound />} Approve
          </Button>
        </>
      }
    >
      {error ? <Alert tone="error" className="mb-3">{error}</Alert> : null}
      <Field label={pending?.permission === "admin" ? "Admin PIN" : "Manager or admin PIN"} htmlFor="override-pin" hint="The approval is logged with the approver's name and works once.">
        <Input
          id="override-pin"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          autoFocus
          maxLength={8}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
          className="text-center text-2xl tracking-[0.5em]"
        />
      </Field>
    </Dialog>
  );

  return { run, dialog };
}
