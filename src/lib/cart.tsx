"use client";

import { createContext, useCallback, useContext, useMemo, useSyncExternalStore, type ReactNode } from "react";

export type CartAddon = { id: string; name: string; price: number };
export type CartLine = {
  lineId: string;
  productId: string;
  slug: string;
  name: string;
  price: number;
  imageUrl: string | null;
  pointsEligible: boolean;
  quantity: number;
  addons: CartAddon[];
  notes: string;
};

type CartContextValue = {
  lines: CartLine[];
  ready: boolean;
  count: number;
  subtotal: number;
  add: (line: Omit<CartLine, "lineId">) => void;
  setQuantity: (lineId: string, quantity: number) => void;
  setNotes: (lineId: string, notes: string) => void;
  remove: (lineId: string) => void;
  clear: () => void;
};

const STORAGE_KEY = "javakubo.cart.v1";
const MAX_QTY = 20;
const EMPTY: CartLine[] = [];

// ---------------------------------------------------------------------------
// A tiny external store backed by localStorage (synced across tabs).
// ---------------------------------------------------------------------------
let current: CartLine[] = EMPTY;
let loaded = false;
const listeners = new Set<() => void>();

function readStorage(): CartLine[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((l) => l && typeof l.productId === "string") : EMPTY;
  } catch {
    return EMPTY; // storage unavailable (private mode) — start empty
  }
}

function getSnapshot() {
  if (!loaded) {
    loaded = true;
    current = readStorage();
  }
  return current;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) {
      current = readStorage();
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function update(fn: (lines: CartLine[]) => CartLine[]) {
  current = fn(getSnapshot());
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    // ignore
  }
  for (const l of listeners) l();
}

const noopSubscribe = () => () => {};

const CartContext = createContext<CartContextValue | null>(null);

const sameLine = (a: Omit<CartLine, "lineId">, b: CartLine) =>
  a.productId === b.productId &&
  a.notes.trim() === b.notes.trim() &&
  a.addons.map((x) => x.id).sort().join() === b.addons.map((x) => x.id).sort().join();

/**
 * The cart lives in the browser (prices are display-only). The server
 * re-prices every line from the database at checkout.
 */
export function CartProvider({ children }: { children: ReactNode }) {
  const lines = useSyncExternalStore(subscribe, getSnapshot, () => EMPTY);
  // false during server render and hydration, true afterwards
  const ready = useSyncExternalStore(noopSubscribe, () => true, () => false);

  const add = useCallback((line: Omit<CartLine, "lineId">) => {
    update((prev) => {
      const existing = prev.find((l) => sameLine(line, l));
      if (existing) {
        return prev.map((l) => (l === existing ? { ...l, quantity: Math.min(MAX_QTY, l.quantity + line.quantity) } : l));
      }
      return [...prev, { ...line, quantity: Math.min(MAX_QTY, line.quantity), lineId: crypto.randomUUID() }];
    });
  }, []);

  const setQuantity = useCallback((lineId: string, quantity: number) => {
    update((prev) =>
      quantity <= 0 ? prev.filter((l) => l.lineId !== lineId) : prev.map((l) => (l.lineId === lineId ? { ...l, quantity: Math.min(MAX_QTY, quantity) } : l)),
    );
  }, []);

  const setNotes = useCallback((lineId: string, notes: string) => {
    update((prev) => prev.map((l) => (l.lineId === lineId ? { ...l, notes: notes.slice(0, 200) } : l)));
  }, []);

  const remove = useCallback((lineId: string) => update((prev) => prev.filter((l) => l.lineId !== lineId)), []);
  const clear = useCallback(() => update(() => EMPTY), []);

  const value = useMemo<CartContextValue>(() => {
    const count = lines.reduce((s, l) => s + l.quantity, 0);
    const subtotal = lines.reduce((s, l) => s + (l.price + l.addons.reduce((a, x) => a + x.price, 0)) * l.quantity, 0);
    return { lines, ready, count, subtotal, add, setQuantity, setNotes, remove, clear };
  }, [lines, ready, add, setQuantity, setNotes, remove, clear]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used inside CartProvider");
  return ctx;
}

/** Shape sent to the server: ids and quantities only. */
export function toOrderItems(lines: CartLine[]) {
  return lines.map((l) => ({
    product_id: l.productId,
    quantity: l.quantity,
    addons: l.addons.map((a) => a.id),
    notes: l.notes,
  }));
}
