"use client";

import { RotateCcw } from "lucide-react";
import { KuboMark } from "@/components/brand/logo";
import { Button, ButtonLink } from "@/components/ui/button";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const notConfigured = /NEXT_PUBLIC_SUPABASE|SUPABASE_SECRET_KEY/.test(error.message);
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-3 px-4 text-center">
      <KuboMark className="size-16" />
      <h1 className="font-display text-3xl font-extrabold text-forest-800">{notConfigured ? "Kainan sa Kubo isn't connected yet" : "Something went wrong"}</h1>
      <p className="max-w-md text-ink-muted">
        {notConfigured
          ? "The Supabase environment variables are missing. Copy .env.example to .env.local and fill in your project URL and keys (see README)."
          : "We couldn't load this page. Please try again — if it keeps happening, let the counter know."}
      </p>
      {error.digest ? <p className="font-mono text-xs text-ink-muted">Ref {error.digest}</p> : null}
      <div className="flex gap-2">
        <Button onClick={reset}><RotateCcw /> Try again</Button>
        <ButtonLink href="/" variant="outline">Home</ButtonLink>
      </div>
    </div>
  );
}
