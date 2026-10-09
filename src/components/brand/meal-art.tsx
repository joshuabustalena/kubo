import Image from "next/image";
import { cn } from "@/lib/utils";

type Kind = "hotdog" | "longganisa" | "tocino" | "chicken" | "liempo" | "porkchop" | "sisig" | "bangus" | "fish" | "egg" | "rice" | "gravy" | "atchara" | "drink" | "water" | "default";

export function mealKind(slug: string, name = ""): Kind {
  const s = `${slug} ${name}`.toLowerCase();
  if (s.includes("water")) return "water";
  if (s.includes("juice") || s.includes("tea") || s.includes("drink")) return "drink";
  if (s.includes("dawg") || s.includes("hotdog")) return "hotdog";
  if (s.includes("long")) return "longganisa";
  if (s.includes("toc")) return "tocino";
  if (s.includes("chick") || s.includes("pops")) return "chicken";
  if (s.includes("liempo")) return "liempo";
  if (s.includes("porkchop")) return "porkchop";
  if (s.includes("sisig")) return "sisig";
  if (s.includes("bangus")) return "bangus";
  if (s.includes("fish")) return "fish";
  if (s.includes("egg")) return "egg";
  if (s.includes("gravy")) return "gravy";
  if (s.includes("atchara")) return "atchara";
  if (s.includes("rice")) return "rice";
  return "default";
}

/**
 * Product photo when uploaded; otherwise an illustrated Kainan sa Kubo tray:
 * black tray, greaseproof paper, golden Java Rice and the meal's star.
 */
export function ProductImage({
  src,
  slug,
  name,
  className,
  sizes = "(max-width: 640px) 100vw, 33vw",
  priority,
}: {
  src?: string | null;
  slug: string;
  name: string;
  className?: string;
  sizes?: string;
  priority?: boolean;
}) {
  return (
    <div className={cn("relative aspect-[4/3] overflow-hidden bg-cream-200", className)}>
      {src ? (
        <Image src={src} alt={name} fill sizes={sizes} priority={priority} className="object-cover" />
      ) : (
        <MealArt kind={mealKind(slug, name)} label={name} />
      )}
    </div>
  );
}

function Rice({ cx, cy, r = 58 }: { cx: number; cy: number; r?: number }) {
  const grains = Array.from({ length: 34 }, (_, i) => {
    const a = (i * 137.5 * Math.PI) / 180;
    const d = Math.sqrt(i / 34) * (r - 10);
    // Rounded: Node and browsers differ in the last digits of sin/cos, which breaks hydration
    return { x: Math.round((cx + Math.cos(a) * d) * 100) / 100, y: Math.round((cy + Math.sin(a) * d * 0.82) * 100) / 100, rot: (i * 47) % 180 };
  });
  return (
    <g>
      <ellipse cx={cx} cy={cy + 6} rx={r + 4} ry={r * 0.8 + 4} fill="#000" opacity=".12" />
      <ellipse cx={cx} cy={cy} rx={r} ry={r * 0.82} fill="#e9a640" />
      <ellipse cx={cx - r * 0.2} cy={cy - r * 0.25} rx={r * 0.6} ry={r * 0.42} fill="#f3c25e" opacity=".7" />
      {grains.map((g, i) => (
        <ellipse key={i} cx={g.x} cy={g.y} rx="4.2" ry="1.9" transform={`rotate(${g.rot} ${g.x} ${g.y})`} fill={i % 5 === 0 ? "#fff3d1" : "#f7d27c"} opacity=".9" />
      ))}
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <circle key={i} cx={cx - 30 + i * 12} cy={cy - 8 + ((i * 17) % 22)} r="2.4" fill="#b8742a" />
      ))}
    </g>
  );
}

function Egg({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <path d="M-34 -6c-4-20 18-30 34-26 20 4 36 12 32 30-3 16-24 26-42 22-14-3-21-12-24-26Z" fill="#fffdf6" />
      <path d="M-34 -6c-4-20 18-30 34-26 20 4 36 12 32 30" fill="none" stroke="#e8c98a" strokeWidth="3" opacity=".6" />
      <circle cx="0" cy="-2" r="13" fill="#f2a516" />
      <circle cx="-4" cy="-6" r="4" fill="#ffd36a" />
    </g>
  );
}

function Star({ kind }: { kind: Kind }) {
  switch (kind) {
    case "hotdog":
      return (
        <g transform="rotate(-18 262 150)">
          <rect x="196" y="132" width="132" height="34" rx="17" fill="#c8382e" />
          <rect x="200" y="135" width="124" height="10" rx="5" fill="#e2675c" opacity=".55" />
          {[0, 1, 2, 3, 4].map((i) => <path key={i} d={`M${218 + i * 22} 134l-8 30`} stroke="#8e2219" strokeWidth="3" strokeLinecap="round" />)}
        </g>
      );
    case "longganisa":
      return (
        <g>
          {[0, 1, 2].map((i) => (
            <g key={i} transform={`rotate(${-20 + i * 14} ${255 + i * 8} ${118 + i * 30})`}>
              <rect x={206 + i * 8} y={104 + i * 30} width="96" height="26" rx="13" fill="#8e3b26" />
              <rect x={210 + i * 8} y={107 + i * 30} width="88" height="7" rx="3.5" fill="#b8573b" opacity=".7" />
            </g>
          ))}
        </g>
      );
    case "tocino":
      return (
        <g>
          {[0, 1, 2].map((i) => (
            <path key={i} d={`M${202 + i * 6} ${104 + i * 30}q50 -18 104 6l-4 22q-50 -16 -98 2Z`} fill={i % 2 ? "#c24a3d" : "#d1584a"} stroke="#7a2318" strokeWidth="2.5" />
          ))}
        </g>
      );
    case "chicken":
      return (
        <g>
          <path d="M214 132c6-34 54-44 82-22 22 18 18 52-8 62-30 12-80-6-74-40Z" fill="#c77b30" />
          <path d="M222 128c8-20 40-30 62-16" stroke="#e4a55a" strokeWidth="6" fill="none" strokeLinecap="round" opacity=".7" />
          {[0, 1, 2, 3, 4, 5].map((i) => <circle key={i} cx={232 + i * 10} cy={142 + ((i * 13) % 18)} r="3" fill="#9b5a1e" />)}
          <path d="M296 170l26 22" stroke="#f3e2c5" strokeWidth="10" strokeLinecap="round" />
          <circle cx="326" cy="197" r="7" fill="#f3e2c5" />
          <circle cx="331" cy="190" r="6" fill="#f3e2c5" />
        </g>
      );
    case "liempo":
    case "porkchop":
      return (
        <g>
          {[0, 1, 2].map((i) => (
            <g key={i}>
              <rect x={206} y={106 + i * 30} width="108" height="24" rx="6" fill="#8a4a24" transform={`rotate(${-6 + i * 4} 260 ${118 + i * 30})`} />
              <rect x={210} y={112 + i * 30} width="100" height="5" rx="2.5" fill="#f1dcc0" transform={`rotate(${-6 + i * 4} 260 ${118 + i * 30})`} />
              {[0, 1, 2, 3].map((j) => (
                <path key={j} d={`M${222 + j * 24} ${108 + i * 30}l10 20`} stroke="#3e1d0c" strokeWidth="3" transform={`rotate(${-6 + i * 4} 260 ${118 + i * 30})`} />
              ))}
            </g>
          ))}
        </g>
      );
    case "sisig":
      return (
        <g>
          <ellipse cx="262" cy="146" rx="72" ry="52" fill="#2b2b2b" stroke="#555" strokeWidth="3" />
          {Array.from({ length: 30 }, (_, i) => (
            <rect key={i} x={222 + ((i * 29) % 80)} y={118 + ((i * 17) % 56)} width="11" height="8" rx="2" fill={i % 3 ? "#9a4f26" : "#c27a3c"} transform={`rotate(${(i * 33) % 90} ${227 + ((i * 29) % 80)} ${122 + ((i * 17) % 56)})`} />
          ))}
          {[0, 1, 2, 3].map((i) => <circle key={i} cx={236 + i * 16} cy={130 + (i % 2) * 22} r="3" fill="#6cad3c" />)}
          <circle cx="314" cy="112" r="10" fill="#8fbf3a" />
        </g>
      );
    case "bangus":
    case "fish":
      return kind === "bangus" ? (
        <g>
          <path d="M200 146c26-36 92-40 118-6 10 14 10 18 0 30-30 34-96 22-118-24Z" fill="#b98a4a" />
          <path d="M318 140l26-20v52Z" fill="#a1773c" />
          <path d="M214 146h96" stroke="#e7c48e" strokeWidth="3" />
          {[0, 1, 2, 3, 4, 5].map((i) => <path key={i} d={`M${226 + i * 14} 134l6 24`} stroke="#7d5526" strokeWidth="2" />)}
          <circle cx="216" cy="140" r="4" fill="#2b1a0c" />
        </g>
      ) : (
        <g>
          {[0, 1].map((i) => (
            <rect key={i} x={206 + i * 18} y={110 + i * 40} width="96" height="34" rx="14" fill="#d79a46" transform={`rotate(${-8 + i * 10} 260 ${126 + i * 40})`} />
          ))}
          {Array.from({ length: 14 }, (_, i) => <circle key={i} cx={220 + ((i * 23) % 80)} cy={118 + ((i * 19) % 70)} r="2.5" fill="#a96a24" />)}
        </g>
      );
    case "egg":
      return <Egg x={262} y={150} s={1.35} />;
    case "gravy":
      return (
        <g>
          <circle cx="262" cy="150" r="46" fill="#fdf9f1" stroke="#d8c9a8" strokeWidth="4" />
          <circle cx="262" cy="150" r="36" fill="#7a4a22" />
          <path d="M240 140q20-12 40 0" stroke="#a46a35" strokeWidth="5" fill="none" strokeLinecap="round" />
        </g>
      );
    case "atchara":
      return (
        <g>
          <circle cx="262" cy="150" r="46" fill="#fdf9f1" stroke="#d8c9a8" strokeWidth="4" />
          {Array.from({ length: 22 }, (_, i) => (
            <rect key={i} x={234 + ((i * 13) % 52)} y={126 + ((i * 11) % 46)} width="16" height="3.5" rx="1.5" fill={i % 4 === 0 ? "#e2672c" : "#e9e0a0"} transform={`rotate(${(i * 41) % 180} ${242 + ((i * 13) % 52)} ${128 + ((i * 11) % 46)})`} />
          ))}
        </g>
      );
    default:
      return <Egg x={262} y={150} s={1.1} />;
  }
}

export function MealArt({ kind, label }: { kind: Kind; label: string }) {
  if (kind === "drink" || kind === "water") {
    return (
      <svg viewBox="0 0 400 300" className="absolute inset-0 size-full" role="img" aria-label={label}>
        <rect width="400" height="300" fill="#efe2c4" />
        <rect y="210" width="400" height="90" fill="#8a5a35" />
        <rect y="210" width="400" height="8" fill="#6b4226" />
        {kind === "water" ? (
          <g>
            <rect x="170" y="60" width="60" height="160" rx="18" fill="#cfe7f3" stroke="#8fbcd6" strokeWidth="4" />
            <rect x="184" y="40" width="32" height="24" rx="6" fill="#2b77b5" />
            <rect x="172" y="120" width="56" height="42" fill="#2b77b5" opacity=".85" />
          </g>
        ) : (
          <g>
            <path d="M150 70h100l-12 150h-76Z" fill="#fff" opacity=".6" stroke="#d8c9a8" strokeWidth="4" />
            <path d="M156 100h88l-9 116h-70Z" fill={label.toLowerCase().includes("calamansi") ? "#e5d24a" : "#a4561c"} opacity=".9" />
            <rect x="196" y="40" width="8" height="90" rx="4" fill="#1f3d2b" transform="rotate(12 200 85)" />
            {[0, 1, 2].map((i) => <rect key={i} x={170 + i * 22} y={110 + (i % 2) * 14} width="18" height="18" rx="4" fill="#fff" opacity=".55" />)}
            <ellipse cx="200" cy="70" rx="50" ry="8" fill="#fff" stroke="#d8c9a8" strokeWidth="4" />
          </g>
        )}
      </svg>
    );
  }
  const isSide = kind === "egg" || kind === "gravy" || kind === "atchara" || kind === "rice";
  return (
    <svg viewBox="0 0 400 300" className="absolute inset-0 size-full" role="img" aria-label={label}>
      <rect width="400" height="300" fill="#8a5a35" />
      <g opacity=".18">
        {Array.from({ length: 12 }, (_, i) => <path key={i} d={`M0 ${i * 26 + 8}q200 ${i % 2 ? 10 : -10} 400 0`} stroke="#3e2614" strokeWidth="2" fill="none" />)}
      </g>
      {/* black tray */}
      <rect x="28" y="30" width="344" height="240" rx="26" fill="#121212" />
      <rect x="40" y="42" width="320" height="216" rx="18" fill="#1d1d1d" />
      {/* greaseproof paper */}
      <g transform="rotate(-4 200 150)">
        <rect x="58" y="58" width="284" height="186" rx="4" fill="#f4ecdc" />
        <path d="M58 150h284M200 58v186" stroke="#e2d6bd" strokeWidth="2" />
        {Array.from({ length: 6 }, (_, i) => <circle key={i} cx={90 + i * 46} cy={78} r="1.6" fill="#c9b78f" />)}
      </g>
      {kind === "rice" ? <Rice cx={200} cy={150} r={70} /> : <Rice cx={isSide ? 128 : 132} cy={152} r={isSide ? 52 : 60} />}
      {kind !== "rice" ? <Star kind={kind} /> : null}
      {/* free iced tea cup */}
      {!isSide ? (
        <g>
          <circle cx="338" cy="58" r="26" fill="#fff" opacity=".85" />
          <circle cx="338" cy="58" r="20" fill="#a4561c" />
          <circle cx="332" cy="52" r="5" fill="#fff" opacity=".45" />
        </g>
      ) : null}
    </svg>
  );
}
