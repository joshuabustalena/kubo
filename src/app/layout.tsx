import type { Metadata, Viewport } from "next";
import { Baloo_2, Plus_Jakarta_Sans } from "next/font/google";
import { KuboMark } from "@/components/brand/logo";
import { RegisterServiceWorker } from "@/components/pwa/install-app";
import { ToastProvider } from "@/components/ui/toast";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import "./globals.css";

const baloo = Baloo_2({ variable: "--font-baloo", subsets: ["latin"], weight: ["600", "700", "800"] });
const jakarta = Plus_Jakarta_Sans({ variable: "--font-jakarta", subsets: ["latin"] });

/**
 * Public address of the site, used to build absolute links for shared-link previews
 * (Facebook, Messenger, Viber, X). Netlify provides URL / DEPLOY_PRIME_URL on its own,
 * so previews work even if NEXT_PUBLIC_SITE_URL was left at localhost.
 */
function siteUrl() {
  const isLocal = (u: string) => {
    try {
      return ["localhost", "127.0.0.1"].includes(new URL(u).hostname);
    } catch {
      return true;
    }
  };
  const candidates = [process.env.NEXT_PUBLIC_SITE_URL, process.env.URL, process.env.DEPLOY_PRIME_URL];
  const pick = candidates.find((u) => u && (process.env.NODE_ENV !== "production" || !isLocal(u))) ?? "http://localhost:3000";
  try {
    return new URL(pick);
  } catch {
    return new URL("http://localhost:3000");
  }
}

const description =
  "Order golden Java Rice meals online, earn loyalty points on every meal, and play the Kainan sa Kubo Play Zone.";

export const metadata: Metadata = {
  metadataBase: siteUrl(),
  title: { default: "Kainan sa Kubo — Sulit Java Rice Meals", template: "%s · Kainan sa Kubo" },
  description,
  applicationName: "Kainan sa Kubo",
  // iPhone "Add to Home Screen": opens full screen with this name (manifest comes from app/manifest.ts)
  appleWebApp: { capable: true, title: "Kainan sa Kubo", statusBarStyle: "default" },
  formatDetection: { telephone: false },
  // The logo images themselves come from app/icon.png, app/apple-icon.png and app/opengraph-image.png
  openGraph: {
    type: "website",
    siteName: "Kainan sa Kubo",
    locale: "en_PH",
    title: "Kainan sa Kubo — Sulit Java Rice Meals",
    description,
  },
  twitter: { card: "summary_large_image", title: "Kainan sa Kubo — Sulit Java Rice Meals", description },
};

export const viewport: Viewport = {
  themeColor: "#1f3d2b",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-PH" className={`${baloo.variable} ${jakarta.variable} h-full antialiased`} suppressHydrationWarning>
      {/* suppressHydrationWarning: browser extensions (Grammarly, Dark Reader, ColorZilla…) add attributes to <html>/<body> */}
      <body className="flex min-h-full flex-col" suppressHydrationWarning>
        <ToastProvider>{isSupabaseConfigured() ? children : <SetupNotice />}</ToastProvider>
        <RegisterServiceWorker />
      </body>
    </html>
  );
}

function SetupNotice() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-4 text-center">
      <KuboMark className="size-16" />
      <h1 className="font-display text-3xl font-extrabold text-forest-800">Kainan sa Kubo isn&apos;t connected yet</h1>
      <p className="max-w-lg text-ink-muted">
        Set <code>NEXT_PUBLIC_SUPABASE_URL</code> and <code>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code> (copy <code>.env.example</code> to{" "}
        <code>.env.local</code>, or add them in Vercel), then restart or redeploy. See the README for the full setup.
      </p>
    </main>
  );
}
