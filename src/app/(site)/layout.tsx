import { BambooSides } from "@/components/brand/bamboo-sides";
import { SiteFooter } from "@/components/site/footer";
import { SiteHeader } from "@/components/site/header";
import { CartProvider } from "@/lib/cart";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <CartProvider>
      {/* relative so the bamboo spans the whole page (it scrolls with it) and stops at the footer */}
      <div className="relative flex flex-1 flex-col">
        <BambooSides />
        <SiteHeader />
        {/* side gutters keep content clear of the bamboo stalks */}
        <main className="flex-1 lg:px-10 xl:px-7">{children}</main>
      </div>
      <SiteFooter />
    </CartProvider>
  );
}
