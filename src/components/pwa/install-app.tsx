"use client";

import { Download, EllipsisVertical, Share, SquarePlus } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

// Android/Chrome fires beforeinstallprompt once, often before any component mounts,
// so it is captured here at module load and shared through a tiny store.
let deferred: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as InstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    notify();
  });
}

type Mode = "server" | "installed" | "ios" | "other";

function subscribe(cb: () => void) {
  listeners.add(cb);
  const mq = window.matchMedia("(display-mode: standalone)");
  mq.addEventListener("change", cb);
  return () => {
    listeners.delete(cb);
    mq.removeEventListener("change", cb);
  };
}

function getMode(): Mode {
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  if (standalone) return "installed";
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  return ios ? "ios" : "other";
}

/** Registers the service worker (production only, so development never serves cached files). */
export function RegisterServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {});
  }, []);
  return null;
}

/**
 * "Install app" button. Android/desktop Chrome: opens the browser's install prompt.
 * iPhone/iPad: shows the Share → Add to Home Screen steps (Safari has no prompt).
 * Other browsers (no one-tap install offered yet): shows the browser-menu steps.
 * Hidden only when the site is already running as the installed app.
 */
export function InstallAppButton({ className, label = "Install app" }: { className?: string; label?: string }) {
  const mode = useSyncExternalStore(subscribe, getMode, () => "server" as Mode);
  const canPrompt = useSyncExternalStore(subscribe, () => deferred !== null, () => false);
  const [iosHelp, setIosHelp] = useState(false);
  const [browserHelp, setBrowserHelp] = useState(false);

  if (mode === "server" || mode === "installed") return null;

  const onClick = async () => {
    if (mode === "ios") return setIosHelp(true);
    if (!canPrompt || !deferred) return setBrowserHelp(true);
    await deferred.prompt();
    await deferred.userChoice;
    deferred = null;
    notify();
  };

  return (
    <>
      <button type="button" onClick={onClick} className={cn("flex items-center gap-3", className)}>
        <Download className="size-5 shrink-0" /> {label}
      </button>
      <Dialog
        open={iosHelp}
        onClose={() => setIosHelp(false)}
        title="Install Kainan sa Kubo"
        description="Add the app to your Home Screen. It opens full screen, like a normal app."
        footer={<Button onClick={() => setIosHelp(false)}>Got it</Button>}
      >
        <ol className="space-y-3 text-sm">
          <li className="flex items-start gap-3">
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-forest-800 font-bold text-cream-50">1</span>
            <span>Open this site in <b>Safari</b>, then tap the <b>Share</b> button <Share className="inline size-4 align-text-bottom" /> at the bottom (or top) of the screen.</span>
          </li>
          <li className="flex items-start gap-3">
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-forest-800 font-bold text-cream-50">2</span>
            <span>Scroll down and tap <b>Add to Home Screen</b> <SquarePlus className="inline size-4 align-text-bottom" />.</span>
          </li>
          <li className="flex items-start gap-3">
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-forest-800 font-bold text-cream-50">3</span>
            <span>Tap <b>Add</b>. The Kainan sa Kubo icon appears on your Home Screen.</span>
          </li>
        </ol>
      </Dialog>
      <Dialog
        open={browserHelp}
        onClose={() => setBrowserHelp(false)}
        title="Install Kainan sa Kubo"
        description="Add the app to your phone or computer. It opens in its own window, like a normal app."
        footer={<Button onClick={() => setBrowserHelp(false)}>Got it</Button>}
      >
        <ol className="space-y-3 text-sm">
          <li className="flex items-start gap-3">
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-forest-800 font-bold text-cream-50">1</span>
            <span>Open the browser menu <EllipsisVertical className="inline size-4 align-text-bottom" /> (top right in Chrome or Edge). On a computer you can also click the install icon at the right end of the address bar.</span>
          </li>
          <li className="flex items-start gap-3">
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-forest-800 font-bold text-cream-50">2</span>
            <span>Choose <b>Install app</b> (or <b>Add to Home screen</b>).</span>
          </li>
          <li className="flex items-start gap-3">
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-forest-800 font-bold text-cream-50">3</span>
            <span>Tap <b>Install</b>. If you opened this link inside Facebook or Messenger, open it in Chrome or Safari first.</span>
          </li>
        </ol>
      </Dialog>
    </>
  );
}
