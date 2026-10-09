"use client";

import {
  Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps, type TooltipValueType,
} from "recharts";
import { dateOnly, peso } from "@/lib/format";

/*
 * Chart palette validated against the cream chart surface (#fdf9f1):
 * series-1 green, series-2 gold, series-3 terracotta — passes CVD and
 * normal-vision separation. Gold is < 3:1 vs the surface, so every chart is
 * paired with a table view and labels use text colours, never series colours.
 */
export const SERIES = { s1: "#3e7d47", s2: "#d19216", s3: "#a8502f" };
const GRID = "#ebe1cc";
const TEXT_MUTED = "#7a6a58";
const TEXT = "#2a2118";
const SURFACE = "#fdf9f1";

const compactPeso = (v: number) =>
  Math.abs(v) >= 1000 ? `₱${(v / 1000).toLocaleString("en-PH", { maximumFractionDigits: 1 })}k` : `₱${Math.round(v)}`;

function TooltipBox({ title, rows }: { title: string; rows: { color?: string; label: string; value: string }[] }) {
  return (
    <div className="rounded-lg border border-bamboo-300 bg-cream-50 px-3 py-2 text-xs shadow-[var(--shadow-card)]">
      <p className="mb-1 font-bold text-ink">{title}</p>
      {rows.map((r) => (
        <p key={r.label} className="flex items-center gap-2 text-ink-soft">
          {r.color ? <span className="inline-block h-0.5 w-3 rounded" style={{ background: r.color }} /> : null}
          <span className="flex-1">{r.label}</span>
          <span className="font-semibold text-ink">{r.value}</span>
        </p>
      ))}
    </div>
  );
}

export type DailyPoint = { day: string; net_sales: number; gross_profit: number; orders: number };

/** Net sales and estimated gross profit per day — same unit, one axis. */
export function SalesTrendChart({ data }: { data: DailyPoint[] }) {
  const last = data[data.length - 1];
  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-4 text-xs text-ink-soft" aria-hidden>
        <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded" style={{ background: SERIES.s1 }} /> Net sales</span>
        <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 rounded" style={{ background: SERIES.s2 }} /> Est. gross profit</span>
      </div>
      <div className="h-64 w-full">
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 8, right: 56, bottom: 0, left: 0 }}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis
              dataKey="day"
              tickFormatter={(d: string) => dateOnly(d).replace(/, \d{4}$/, "")}
              tick={{ fill: TEXT_MUTED, fontSize: 11 }}
              axisLine={{ stroke: GRID }}
              tickLine={false}
              minTickGap={24}
            />
            <YAxis tickFormatter={compactPeso} tick={{ fill: TEXT_MUTED, fontSize: 11 }} axisLine={false} tickLine={false} width={52} />
            <Tooltip
              cursor={{ stroke: TEXT_MUTED, strokeWidth: 1 }}
              content={(p: TooltipContentProps<TooltipValueType, string | number>) =>
                p.active && p.payload?.length ? (
                  <TooltipBox
                    title={dateOnly(String(p.label))}
                    rows={[
                      { color: SERIES.s1, label: "Net sales", value: peso(p.payload[0]?.payload.net_sales) },
                      { color: SERIES.s2, label: "Est. gross profit", value: peso(p.payload[0]?.payload.gross_profit) },
                      { label: "Orders", value: String(p.payload[0]?.payload.orders) },
                    ]}
                  />
                ) : null
              }
            />
            <Line type="monotone" dataKey="net_sales" stroke={SERIES.s1} strokeWidth={2} dot={false}
              activeDot={{ r: 5, stroke: SURFACE, strokeWidth: 2 }} isAnimationActive={false}
              label={(props: { index?: number; x?: number | string; y?: number | string }) =>
                props.index === data.length - 1 && last ? (
                  <text x={Number(props.x) + 8} y={Number(props.y)} fill={TEXT} fontSize={11} fontWeight={700} dominantBaseline="middle">{compactPeso(last.net_sales)}</text>
                ) : <g />
              }
            />
            <Line type="monotone" dataKey="gross_profit" stroke={SERIES.s2} strokeWidth={2} dot={false}
              activeDot={{ r: 5, stroke: SURFACE, strokeWidth: 2 }} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/** Ranked horizontal bars for one measure (best sellers, payment mix, expenses). */
export function RankedBars({
  data,
  valueLabel,
  format = "peso",
  color = SERIES.s1,
}: {
  data: { label: string; value: number; note?: string }[];
  valueLabel: string;
  format?: "peso" | "number";
  color?: string;
}) {
  const fmt = (v: number) => (format === "peso" ? peso(v) : v.toLocaleString("en-PH"));
  const height = Math.max(120, data.length * 34 + 16);
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 84, bottom: 4, left: 0 }} barCategoryGap={8}>
          <CartesianGrid stroke={GRID} horizontal={false} />
          <XAxis type="number" hide />
          <YAxis type="category" dataKey="label" width={130} tick={{ fill: TEXT, fontSize: 12 }} axisLine={false} tickLine={false} />
          <Tooltip
            cursor={{ fill: "rgba(176,141,87,0.10)" }}
            content={(p: TooltipContentProps<TooltipValueType, string | number>) =>
              p.active && p.payload?.length ? (
                <TooltipBox
                  title={String(p.payload[0].payload.label)}
                  rows={[
                    { color, label: valueLabel, value: fmt(Number(p.payload[0].value)) },
                    ...(p.payload[0].payload.note ? [{ label: "", value: String(p.payload[0].payload.note) }] : []),
                  ]}
                />
              ) : null
            }
          />
          <Bar dataKey="value" fill={color} radius={[0, 4, 4, 0]} maxBarSize={22} isAnimationActive={false}
            label={{ position: "right", fill: TEXT, fontSize: 11, formatter: (v: unknown) => fmt(Number(v)) }} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
