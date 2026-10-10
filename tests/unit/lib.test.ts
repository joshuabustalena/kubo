import { describe, expect, it } from "vitest";
import { toFailure } from "@/lib/errors";
import { addDays, manilaDate, peso } from "@/lib/format";
import { pointsForLine, pointsForPrice } from "@/lib/points";
import { slugify } from "@/lib/utils";

const rules = { points_enabled: true, points_price_threshold: 65, points_at_or_below: 1, points_above: 2, points_on_addons: false };

describe("peso formatting", () => {
  it("uses ₱ with thousands separators and two decimals", () => {
    expect(peso(1234)).toBe("₱1,234.00");
    expect(peso("65.5")).toBe("₱65.50");
    expect(peso(null)).toBe("₱0.00");
  });
});

describe("points preview mirrors the database rule", () => {
  it.each([
    [60, 1],
    [65, 1],
    [70, 2],
    [85, 2],
    [95, 2],
  ])("₱%i meal earns %i", (price, pts) => expect(pointsForPrice(price, rules)).toBe(pts));

  it("counts per meal quantity and ignores add-ons by default", () => {
    expect(pointsForLine({ price: 70, quantity: 3, pointsEligible: true, addons: [{ price: 15, pointsEligible: true }] }, rules)).toBe(6);
    expect(pointsForLine({ price: 25, quantity: 2, pointsEligible: false }, rules)).toBe(0);
    expect(pointsForLine({ price: 70, quantity: 1, pointsEligible: true, addons: [{ price: 15, pointsEligible: true }] }, { ...rules, points_on_addons: true })).toBe(3);
    expect(pointsForPrice(95, { ...rules, points_enabled: false })).toBe(0);
  });
});

describe("Manila dates", () => {
  it("uses Asia/Manila (UTC+8) calendar days", () => {
    expect(manilaDate(new Date("2026-10-09T16:30:00Z"))).toBe("2026-10-10");
    expect(manilaDate(new Date("2026-10-09T15:59:00Z"))).toBe("2026-10-09");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("error mapping", () => {
  it("detects manager/admin authorization and cooldown prefixes", () => {
    expect(toFailure({ message: "AUTH_REQUIRED: A manager PIN is required." })).toMatchObject({ auth: "manager", error: "A manager PIN is required." });
    expect(toFailure({ message: "AUTH_REQUIRED_ADMIN: Admin PIN needed." })).toMatchObject({ auth: "admin" });
    expect(toFailure({ message: "COOLDOWN:42:Wait a bit." })).toMatchObject({ cooldown: 42, error: "Wait a bit." });
    expect(toFailure({ message: 'new row violates row-level security policy for table "orders"' }).error).toBe("You don't have access to do that.");
  });
});

describe("slugify", () => {
  it("makes URL-safe slugs", () => {
    expect(slugify("Java Sisig Supreme!")).toBe("java-sisig-supreme");
    expect(slugify("  Piña  Juice ")).toBe("pina-juice");
  });
});
