"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useActionState } from "react";
import { Alert } from "@/components/ui/feedback";
import { Field, Input } from "@/components/ui/form";
import { PasswordInput } from "@/components/ui/password-input";
import { SubmitButton } from "@/components/ui/submit-button";
import { signup, type AuthState } from "../actions";

function SignupForm() {
  const next = useSearchParams().get("next") ?? "";
  const [state, action] = useActionState<AuthState, FormData>(signup, {});
  if (state.message) {
    return (
      <div className="space-y-4">
        <h1 className="font-display text-3xl font-extrabold text-forest-800">Account created</h1>
        <Alert tone="success">{state.message}</Alert>
        <Link href="/login" className="font-semibold text-forest-700 hover:underline">Go to log in</Link>
      </div>
    );
  }
  return (
    <form action={action} className="space-y-4">
      <div>
        <h1 className="font-display text-3xl font-extrabold text-forest-800">Join Kainan sa Kubo</h1>
        <p className="text-sm text-ink-muted">Earn points on every meal and play the Play Zone. No email needed.</p>
      </div>
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      <input type="hidden" name="next" value={next} />
      <Field label="Username" htmlFor="username" hint="3–20 letters, numbers, dots or underscores. You'll use this to log in.">
        <Input id="username" name="username" autoComplete="username" autoCapitalize="none" required minLength={3} maxLength={20} defaultValue={state.fields?.username} placeholder="e.g. juan.dc" />
      </Field>
      <Field label="Mobile number" htmlFor="phone" hint="So the counter can reach you about your order. You can also log in with it.">
        <Input id="phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" required defaultValue={state.fields?.phone} placeholder="0917 123 4567" />
      </Field>
      <Field label="Password" htmlFor="password" hint="At least 8 characters.">
        <PasswordInput id="password" name="password" autoComplete="new-password" required minLength={8} />
      </Field>
      <Field label="Confirm password" htmlFor="confirm">
        <PasswordInput id="confirm" name="confirm" autoComplete="new-password" required minLength={8} />
      </Field>
      <SubmitButton className="w-full" size="lg" pendingText="Creating account…">Create account</SubmitButton>
      <p className="text-center text-sm">
        Already have an account? <Link href={`/login${next ? `?next=${encodeURIComponent(next)}` : ""}`} className="font-semibold text-forest-700 hover:underline">Log in</Link>
      </p>
    </form>
  );
}

export default function SignupPage() {
  return (
    <Suspense>
      <SignupForm />
    </Suspense>
  );
}
