export type Role = "admin" | "staff" | "customer";
export type OrderStatus = "pending" | "confirmed" | "preparing" | "ready" | "completed" | "cancelled";
export type PaymentStatus = "unpaid" | "pending_verification" | "paid" | "partially_refunded" | "refunded";
export type ServiceType = "dine_in" | "takeout";
export type StockUnit = "kg" | "g" | "l" | "ml" | "pc" | "pack" | "bottle";
export type CostType = "ingredient" | "oil_seasoning" | "gravy" | "drink" | "packaging" | "consumable";
export type StaffPermission = "apply_discount" | "void_order" | "refund_order" | "view_sales";

export const STOCK_UNITS: StockUnit[] = ["kg", "g", "l", "ml", "pc", "pack", "bottle"];
export const COST_TYPES: { value: CostType; label: string }[] = [
  { value: "ingredient", label: "Ingredient" },
  { value: "oil_seasoning", label: "Oil & seasoning" },
  { value: "gravy", label: "Gravy" },
  { value: "drink", label: "Free drink" },
  { value: "packaging", label: "Packaging" },
  { value: "consumable", label: "Other consumable" },
];
export const STAFF_PERMISSIONS: { value: StaffPermission; label: string; help: string }[] = [
  { value: "apply_discount", label: "Apply discounts", help: "Up to the staff discount limit in Settings." },
  { value: "void_order", label: "Void paid orders", help: "Cancel a paid order and return the money." },
  { value: "refund_order", label: "Refund completed orders", help: "Full or partial refunds." },
  { value: "view_sales", label: "View today's sales", help: "A read-only summary for today." },
];

export type Profile = {
  id: string;
  email: string;
  username: string | null;
  full_name: string;
  phone: string;
  student_school: string;
  role: Role;
  permissions: StaffPermission[];
  is_active: boolean;
  points_balance: number;
  game_tokens: number;
  created_at: string;
};

export type StoreSettings = {
  store_name: string;
  tagline: string;
  about: string;
  address: string;
  phone: string;
  email: string;
  facebook_url: string;
  map_url: string;
  opening_hours: { days: string; hours: string }[];
  online_ordering_enabled: boolean;
  takeout_packaging_fee: number;
  points_enabled: boolean;
  points_price_threshold: number;
  points_at_or_below: number;
  points_above: number;
  points_on_addons: boolean;
  inventory_deduct_stage: "preparing" | "completed";
  restock_on_cancel: boolean;
  block_orders_on_low_stock: boolean;
  max_staff_discount_percent: number;
  game_tokens_enabled: boolean;
  game_token_cost: number;
};

export type Category = {
  id: string;
  name: string;
  slug: string;
  description: string;
  sort_order: number;
  is_active: boolean;
  is_addon_category: boolean;
  is_demo: boolean;
};

export type Product = {
  id: string;
  category_id: string;
  name: string;
  slug: string;
  description: string;
  price: number;
  image_url: string | null;
  /** Small cut-out picture for the POS tiles (separate from the menu photo). */
  pos_icon_url?: string | null;
  is_available: boolean;
  is_archived: boolean;
  is_addon: boolean;
  points_eligible: boolean;
  is_featured: boolean;
  sort_order: number;
  is_demo: boolean;
  track_stock: boolean;
  stock_quantity: number;
};

/** Sold out = switched off by staff, or tracked servings ran out. */
export function isSoldOut(p: { is_available: boolean; track_stock?: boolean; stock_quantity?: number }): boolean {
  return !p.is_available || (!!p.track_stock && (p.stock_quantity ?? 0) <= 0);
}

/** Servings left for tracked items, otherwise null (unlimited). */
export function servingsLeft(p: { track_stock?: boolean; stock_quantity?: number }): number | null {
  return p.track_stock ? Math.max(0, p.stock_quantity ?? 0) : null;
}

export type PaymentMethod = {
  code: string;
  name: string;
  instructions: string;
  is_active: boolean;
  allow_online: boolean;
  allow_pos: boolean;
  is_cash: boolean;
  requires_reference: boolean;
  sort_order: number;
};

export type Order = {
  id: string;
  order_number: string;
  channel: "online" | "pos";
  customer_id: string | null;
  customer_name: string;
  service_type: ServiceType;
  status: OrderStatus;
  payment_status: PaymentStatus;
  payment_method_code: string | null;
  subtotal: number;
  packaging_fee: number;
  discount_total: number;
  total: number;
  refunded_total: number;
  discount_reason: string;
  notes: string;
  staff_id: string | null;
  points_awarded_at: string | null;
  inventory_deducted_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string;
  is_demo: boolean;
  created_at: string;
  updated_at: string;
};

export type OrderItem = {
  id: string;
  order_id: string;
  parent_item_id: string | null;
  product_id: string | null;
  product_name: string;
  category_name: string;
  unit_price: number;
  quantity: number;
  line_total: number;
  unit_cost: number;
  points_eligible: boolean;
  points_per_unit: number;
  refunded_quantity: number;
  notes: string;
};

export type Payment = {
  id: string;
  order_id: string;
  method_code: string;
  amount: number;
  amount_tendered: number | null;
  change_given: number;
  reference_no: string;
  status: "pending" | "verified" | "rejected";
  received_by: string | null;
  verified_at: string | null;
  created_at: string;
};

export type Reward = {
  id: string;
  name: string;
  description: string;
  reward_type: "free_product" | "fixed_discount" | "percent_discount";
  value: number;
  product_id: string | null;
  points_cost: number;
  is_redeemable: boolean;
  per_customer_limit: number | null;
  total_limit: number | null;
  valid_days: number;
  expires_at: string | null;
  is_active: boolean;
};

export type Redemption = {
  id: string;
  reward_id: string;
  customer_id: string;
  code: string;
  source: "points" | "game" | "admin";
  points_spent: number;
  status: "issued" | "used" | "expired" | "cancelled";
  expires_at: string;
  used_at: string | null;
  order_id: string | null;
  discount_applied: number;
  created_at: string;
};

export type Game = {
  code: "catch" | "memory" | "wheel" | "quiz";
  name: string;
  tagline: string;
  rules: string;
  is_enabled: boolean;
  daily_play_limit: number;
  cooldown_seconds: number;
  daily_points_cap: number;
  config: Record<string, unknown>;
  sort_order: number;
};

export type GamePrize = {
  id: string;
  game_code: Game["code"];
  label: string;
  prize_type: "none" | "points" | "reward";
  points: number;
  reward_id: string | null;
  weight: number;
  min_score: number;
  is_active: boolean;
  sort_order: number;
};

export type InventoryItem = {
  id: string;
  sku: string;
  name: string;
  category: string;
  unit: StockUnit;
  current_stock: number;
  min_stock: number;
  avg_cost: number;
  last_purchase_cost: number;
  supplier_id: string | null;
  expiration_date: string | null;
  is_archived: boolean;
  notes: string;
};

export type Supplier = {
  id: string;
  name: string;
  contact_person: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
  is_active: boolean;
};
