import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

/*
 * Bamboo stalks down both sides of the customer site. They scroll with the
 * page (absolute, full page height) instead of staying fixed. Leaves come from
 * a tall SVG tile that repeats down the page; each tile places clusters at
 * different heights, sizes, angles and shades, and the two sides use different
 * tiles so they never mirror each other. Pure CSS, so it works for any height.
 */

/** Rounded-cylinder shading plus a node ring every `gap` px. */
function stalk(gap: number, offset = 0): CSSProperties {
  return {
    borderRadius: 999,
    boxShadow: "2px 0 6px rgb(62 38 20 / 0.15)",
    backgroundImage: [
      `repeating-linear-gradient(180deg, transparent 0 ${gap - 7}px, rgb(120 90 48 / 0.8) ${gap - 7}px ${gap - 4}px, rgb(255 250 235 / 0.55) ${gap - 4}px ${gap - 1}px, transparent ${gap - 1}px ${gap}px)`,
      "linear-gradient(90deg, #9c7c44 0%, #d4b47a 20%, #efdcb0 36%, #d9bd85 55%, #b08d57 80%, #8a6a3c 100%)",
    ].join(", "),
    backgroundPosition: `0 ${offset}px, 0 0`,
  };
}

const TONES = [
  ["#5e8c31", "#4a7326", "#6f9c3e"], // fresh green
  ["#4f7d2a", "#3a5c1e", "#5e8c31"], // deep green
  ["#7aa646", "#5e8c31", "#8bb456"], // young leaf
  ["#9a9a45", "#7d7f34", "#b0a85a"], // drying, slightly yellow
];

/** One cluster of three leaves, origin at the stem (where it meets the stalk). */
function cluster(tone: number) {
  const [a, b, c] = TONES[tone];
  return (
    `<path d='M0 0C22-20 54-26 90-20C60-8 30 0 0 0Z' fill='${a}'/>` +
    `<path d='M0 0C26-8 58-8 86 4C56 8 26 6 0 0Z' fill='${b}'/>` +
    `<path d='M0 0C20 10 42 22 68 30C40 28 16 16 0 0Z' fill='${c}'/>` +
    `<path d='M4-1C32-12 58-17 84-18M4 0C32-2 56-1 80 3M4 1C22 10 42 20 62 27' stroke='#2f4a18' stroke-width='1' fill='none' opacity='.4'/>`
  );
}

type Leaf = { x: number; y: number; r: number; s: number; tone: number; o?: number };

const TILE_W = 144;
const TILE_H = 960;

function leafTile(leaves: Leaf[], flip: boolean): string {
  const body = leaves
    .map((l) => `<g transform='translate(${l.x} ${l.y}) rotate(${l.r}) scale(${l.s})' opacity='${l.o ?? 1}'>${cluster(l.tone)}</g>`)
    .join("");
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='${TILE_W}' height='${TILE_H}' viewBox='0 0 ${TILE_W} ${TILE_H}'>` +
    (flip ? `<g transform='translate(${TILE_W} 0) scale(-1 1)'>${body}</g>` : body) +
    `</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

// x = 26 is the main stalk, x = 57 the thin back stalk. Negative rotation tips up, positive droops.
const LEFT: Leaf[] = [
  { x: 26, y: 90, r: -10, s: 1.05, tone: 0 },
  { x: 57, y: 205, r: 18, s: 0.62, tone: 2, o: 0.85 },
  { x: 26, y: 330, r: 26, s: 0.8, tone: 1 },
  { x: 26, y: 345, r: -32, s: 0.55, tone: 2 },
  { x: 57, y: 470, r: -18, s: 0.78, tone: 0, o: 0.9 },
  { x: 26, y: 600, r: 8, s: 0.95, tone: 3 },
  { x: 57, y: 735, r: 34, s: 0.5, tone: 1, o: 0.85 },
  { x: 26, y: 845, r: -22, s: 0.72, tone: 0 },
];

const RIGHT: Leaf[] = [
  { x: 26, y: 40, r: 14, s: 0.7, tone: 1 },
  { x: 57, y: 160, r: -24, s: 0.9, tone: 0, o: 0.9 },
  { x: 26, y: 285, r: -6, s: 1, tone: 2 },
  { x: 57, y: 420, r: 28, s: 0.6, tone: 3, o: 0.85 },
  { x: 26, y: 520, r: -30, s: 0.82, tone: 0 },
  { x: 26, y: 540, r: 20, s: 0.5, tone: 1 },
  { x: 57, y: 680, r: -12, s: 0.75, tone: 2, o: 0.9 },
  { x: 26, y: 820, r: 12, s: 0.95, tone: 1 },
];

// Medium screens have only a slim stalk and a narrow gutter, so leaves are smaller
// and angle steeply along the stalk (up or drooping) instead of reaching across.
function along(leaves: Leaf[], x: number, scale: number): Leaf[] {
  return leaves
    .filter((l) => l.x === 26)
    .concat(leaves.filter((l) => l.x !== 26).map((l) => ({ ...l, y: l.y + 40 })))
    .map((l) => ({ ...l, x, s: l.s * scale, r: l.r < 0 ? Math.min(l.r, -38) - 10 : Math.max(l.r, 38) + 12 }));
}

const LEFT_TILE = leafTile(LEFT, false);
const RIGHT_TILE = leafTile(RIGHT, true);
const LEFT_TILE_LG = leafTile(along(LEFT, 14, 0.52), false);
const RIGHT_TILE_LG = leafTile(along(RIGHT, 14, 0.52), true);
const LEFT_TILE_XL = leafTile(along(LEFT, 26, 0.68), false);
const RIGHT_TILE_XL = leafTile(along(RIGHT, 26, 0.68), true);

function leafLayer(tile: string, left: boolean): CSSProperties {
  return {
    backgroundImage: tile,
    backgroundRepeat: "repeat-y",
    backgroundSize: `${TILE_W}px ${TILE_H}px`,
    backgroundPosition: left ? "0 0" : `100% ${Math.round(TILE_H * 0.37)}px`,
  };
}

function Side({ side }: { side: "left" | "right" }) {
  const left = side === "left";
  return (
    <div aria-hidden className={cn("pointer-events-none absolute inset-y-0 z-30 hidden w-36 lg:block", left ? "left-0" : "right-0")}>
      {/* main stalk: slim on medium screens, full width where the margins allow */}
      <div className={cn("absolute inset-y-0 w-4 xl:w-7", left ? "left-1.5 xl:left-3" : "right-1.5 xl:right-3")} style={stalk(150)} />
      {/* thinner back stalk with offset nodes, only where there is room */}
      <div className={cn("absolute inset-y-0 hidden w-[18px] opacity-75 min-[1440px]:block", left ? "left-12" : "right-12")} style={stalk(110, 47)} />
      {/* leaves all the way down the page, sized to the room each screen width has */}
      <div className="absolute inset-0 hidden lg:block xl:hidden" style={leafLayer(left ? LEFT_TILE_LG : RIGHT_TILE_LG, left)} />
      <div className="absolute inset-0 hidden xl:block min-[1440px]:hidden" style={leafLayer(left ? LEFT_TILE_XL : RIGHT_TILE_XL, left)} />
      <div className="absolute inset-0 hidden min-[1440px]:block" style={leafLayer(left ? LEFT_TILE : RIGHT_TILE, left)} />
    </div>
  );
}

/** Bamboo framing the page on wide screens. Place inside a `relative` wrapper. Purely decorative. */
export function BambooSides() {
  return (
    <>
      <Side side="left" />
      <Side side="right" />
    </>
  );
}
