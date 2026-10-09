import type { Metadata } from "next";
import { getMenu, getStoreSettings } from "@/lib/data";
import { MenuBrowser } from "./menu-browser";

export const metadata: Metadata = { title: "Menu" };

export default async function MenuPage(props: PageProps<"/menu">) {
  const sp = await props.searchParams;
  const [menu, settings] = await Promise.all([getMenu(), getStoreSettings()]);
  return (
    <div className="mx-auto max-w-6xl px-4 pb-6 pt-8">
      <h1 className="font-display text-4xl font-extrabold text-forest-800">Our menu</h1>
      <p className="text-ink-muted">All meals come with golden Java Rice and a free cup of iced tea.</p>
      <div className="mt-4">
        <MenuBrowser menu={menu} rules={settings} initialCategory={typeof sp.category === "string" ? sp.category : undefined} />
      </div>
    </div>
  );
}
