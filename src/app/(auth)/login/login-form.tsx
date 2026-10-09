"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Alert } from "@/components/ui/feedback";
import { Field, Input } from "@/components/ui/form";
import { PasswordInput } from "@/components/ui/password-input";
import { SubmitButton } from "@/components/ui/submit-button";
import { login, type AuthState } from "../actions";

export function LoginForm({ next, confirmed, linkFailed }: { next: string; confirmed: boolean; linkFailed: boolean }) {
  const [state, action] = useActionState<AuthState, FormData>(login, {});
  return (
    <form action={action} className="space-y-4">
      <div>
        <h1 className="font-display text-3xl font-extrabold text-forest-800">Welcome back</h1>
        <p className="text-sm text-ink-muted">Log in to order, track your food and collect points.</p>
      </div>
      {confirmed ? <Alert tone="success">You can log in now.</Alert> : null}
      {linkFailed ? <Alert tone="error">That link has expired or was already used. Please try again.</Alert> : null}
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      <input type="hidden" name="next" value={next} />
      <Field label="Username or mobile number" htmlFor="identifier">
        <Input id="identifier" name="identifier" autoComplete="username" autoCapitalize="none" required defaultValue={state.fields?.identifier} placeholder="e.g. juan.dc or 0917 123 4567" />
      </Field>
      <Field label="Password" htmlFor="password">
        <PasswordInput id="password" name="password" autoComplete="current-password" required />
      </Field>
      <SubmitButton className="w-full" size="lg" pendingText="Logging in…">Log in</SubmitButton>
      <div className="flex flex-wrap justify-between gap-2 text-sm">
        <Link href="/forgot-password" className="font-semibold text-forest-700 hover:underline">Forgot password?</Link>
        <Link href={`/signup${next ? `?next=${encodeURIComponent(next)}` : ""}`} className="font-semibold text-forest-700 hover:underline">
          New here? Create an account
        </Link>
      </div>
      <p className="text-center text-sm"><Link href="/menu" className="text-ink-muted hover:underline">Just browsing? See the menu</Link></p>
    </form>
  );
}
