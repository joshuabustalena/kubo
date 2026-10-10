import type { MetadataRoute } from "next";

/** Installable app (Android "Install app", iPhone "Add to Home Screen"). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Kainan sa Kubo",
    short_name: "Kainan sa Kubo",
    description: "Order Java Rice meals, earn points and play the Kainan sa Kubo Play Zone. Staff POS included.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#fdf6e9",
    theme_color: "#1f3d2b",
    lang: "en-PH",
    categories: ["food", "shopping"],
    icons: [
      { src: "/pwa/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/pwa/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/pwa/maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/pwa/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    // Long-press the app icon on Android
    shortcuts: [
      { name: "Menu", short_name: "Menu", url: "/menu", icons: [{ src: "/pwa/icon-192.png", sizes: "192x192" }] },
      { name: "My orders", short_name: "Orders", url: "/account/orders", icons: [{ src: "/pwa/icon-192.png", sizes: "192x192" }] },
      { name: "Staff POS", short_name: "POS", url: "/pos", icons: [{ src: "/pwa/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
