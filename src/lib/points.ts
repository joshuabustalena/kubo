/**
 * Display-only mirror of public.points_for_price(). The database is the
 * source of truth; this is used to preview "you'll earn N points".
 */
export type PointsRules = {
  points_enabled: boolean;
  points_price_threshold: number | string;
  points_at_or_below: number;
  points_above: number;
  points_on_addons: boolean;
};

export function pointsForPrice(price: number, rules: PointsRules): number {
  if (!rules.points_enabled) return 0;
  return price <= Number(rules.points_price_threshold) ? rules.points_at_or_below : rules.points_above;
}

export function pointsForLine(
  line: { price: number; quantity: number; pointsEligible: boolean; addons?: { price: number; pointsEligible: boolean }[] },
  rules: PointsRules,
): number {
  let points = line.pointsEligible ? pointsForPrice(line.price, rules) * line.quantity : 0;
  if (rules.points_on_addons) {
    for (const a of line.addons ?? []) {
      if (a.pointsEligible) points += pointsForPrice(a.price, rules) * line.quantity;
    }
  }
  return points;
}
