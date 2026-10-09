"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/feedback";
import { Field, Input } from "@/components/ui/form";
import { SubmitButton } from "@/components/ui/submit-button";
import { updateProfile, type ProfileState } from "./actions";

export function ProfileForm({ user }: { user: { full_name: string; phone: string; student_school: string } }) {
  const [state, action] = useActionState<ProfileState, FormData>(updateProfile, {});
  return (
    <form action={action} className="paper space-y-4 p-5">
      <h2 className="font-display text-xl font-bold text-wood-800">Your details</h2>
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      {state.saved ? <Alert tone="success">Saved!</Alert> : null}
      <Field label="Full name" htmlFor="full_name">
        <Input id="full_name" name="full_name" defaultValue={user.full_name} required maxLength={120} autoComplete="name" />
      </Field>
      <Field label="Mobile number" htmlFor="phone" hint="So we can reach you about your order.">
        <Input id="phone" name="phone" defaultValue={user.phone} maxLength={30} inputMode="tel" autoComplete="tel" />
      </Field>
      <Field label="School (optional)" htmlFor="student_school">
        <Input id="student_school" name="student_school" defaultValue={user.student_school} maxLength={120} />
      </Field>
      <SubmitButton pendingText="Saving…">Save changes</SubmitButton>
    </form>
  );
}
