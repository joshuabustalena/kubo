"use client";

import { Loader2 } from "lucide-react";
import { useFormStatus } from "react-dom";
import type { ComponentProps } from "react";
import { Button } from "./button";

/** Submit button that disables itself while its form is pending (no double submits). */
export function SubmitButton({ children, pendingText, disabled, ...props }: ComponentProps<typeof Button> & { pendingText?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || disabled} aria-busy={pending} {...props}>
      {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
      {pending && pendingText ? pendingText : children}
    </Button>
  );
}
