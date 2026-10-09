import type { Metadata, Viewport } from "next";
import { Baloo_2, Plus_Jakarta_Sans } from "next/font/google";
import { KuboMark } from "@/components/brand/logo";
import { ToastProvider } from "@/components/ui/toast";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import "./globals.css";

const baloo = Baloo_2({ variable: "--font-baloo", subsets: ["latin"], weight: ["600", "700", "800"] });
const jakarta = Plus_Jakarta_Sans({ variable: "--font-jakarta", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "Kainan sa Kubo — Sulit Java Rice Meals", template: "%s · Kainan sa Kubo" },
  description:
    "Order golden Java Rice meals online, earn loyalty points on every meal, and play the Kainan sa Kubo Play Zone.",
  applicationName: "Kainan sa Kubo",
};

export const viewport: Viewport = {
  themeColor: "#1f3d2b",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en-PH" className={`${baloo.variable} ${jakarta.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <ToastProvider>{isSupabaseConfigured() ? children : <SetupNotice />}</ToastProvider>
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
