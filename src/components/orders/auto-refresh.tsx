"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Re-fetches server data on an interval while the tab is visible. */
export function AutoRefresh({ seconds = 15, enabled = true }: { seconds?: number; enabled?: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, seconds * 1000);
    return () => clearInterval(id);
  }, [router, seconds, enabled]);
  return null;
}
