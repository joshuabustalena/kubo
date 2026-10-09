"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Alert } from "@/components/ui/feedback";
import { Field } from "@/components/ui/form";
import { PasswordInput } from "@/components/ui/password-input";
import { SubmitButton } from "@/components/ui/submit-button";
import { updatePassword, type AuthState } from "../actions";

export default function ResetPasswordPage() {
  const [state, action] = useActionState<AuthState, FormData>(updatePassword, {});
  return (
    <form action={action} className="space-y-4">
      <h1 className="font-display text-3xl font-extrabold text-forest-800">Choose a new password</h1>
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      {state.message ? (
        <Alert tone="success">
          {state.message} <Link href="/account" className="font-semibold underline">Go to my account</Link>
        </Alert>
      ) : null}
      <Field label="New password" htmlFor="password" hint="At least 8 characters.">
        <PasswordInput id="password" name="password" autoComplete="new-password" required minLength={8} />
      </Field>
      <Field label="Confirm new password" htmlFor="confirm">
        <PasswordInput id="confirm" name="confirm" autoComplete="new-password" required minLength={8} />
      </Field>
      <SubmitButton className="w-full" size="lg" pendingText="Saving…">Update password</SubmitButton>
    </form>
  );
}
