import type { Metadata } from "next";
import { DateRangeFilter } from "@/components/admin/date-range";
import { PageHeader } from "@/components/admin/page-header";
import { PrintButton } from "@/components/admin/report-section";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { dateRange } from "@/lib/admin";
import { dateTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Audit log" };

function summarize(details: Record<string, unknown>): string {
  const entries = Object.entries(details ?? {});
  if (entries.length === 0) return "";
  return entries
    .slice(0, 6)
    .map(([k, v]) => {
      if (v && typeof v === "object" && "from" in (v as object) && "to" in (v as object)) {
        const c = v as { from: unknown; to: unknown };
        return `${k}: ${JSON.stringify(c.from)} → ${JSON.stringify(c.to)}`;
      }
      return `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`;
    })
    .join(" · ")
    .slice(0, 400);
}

export default async function AuditPage(props: PageProps<"/admin/audit">) {
  const sp = await props.searchParams;
  const { from, to } = dateRange(sp, 7);
  const kind = typeof sp.kind === "string" ? sp.kind : "";
  const supabase = await createClient();
  let q = supabase
    .from("audit_logs")
    .select("*, profiles:actor_id(full_name, email)")
    .gte("created_at", new Date(`${from}T00:00:00+08:00`).toISOString())
    .lt("created_at", new Date(new Date(`${to}T00:00:00+08:00`).getTime() + 86400000).toISOString())
    .order("created_at", { ascending: false })
    .limit(500);
  if (kind === "money") q = q.or("action.like.order.%,action.like.payment.%,action.like.override.%");
  if (kind === "stock") q = q.or("action.like.stock.%,action.like.purchase.%");
  if (kind === "settings") q = q.in("entity_type", ["store_settings", "products", "rewards", "games", "game_prizes", "promotions", "payment_methods", "recipes", "recipe_ingredients"]);
  if (kind === "access") q = q.or("action.like.user.%,action.like.pin.%");
  const { data } = await q;
  const base = `/admin/audit?from=${from}&to=${to}`;

  return (
    <div className="space-y-4">
      <PageHeader title="Audit log" description="Every void, refund, discount, payment check, stock change, price/setting edit and access change, with who did it." actions={<PrintButton />} />
      <DateRangeFilter from={from} to={to} />
      <div className="flex flex-wrap gap-2">
        {[["", "All"], ["money", "Money & orders"], ["stock", "Stock"], ["settings", "Menu & settings"], ["access", "Access"]].map(([k, l]) => (
          <ButtonLink key={k} size="sm" variant={kind === k ? "primary" : "outline"} href={`${base}${k ? `&kind=${k}` : ""}`}>{l}</ButtonLink>
        ))}
      </div>
      <Card>
        <Table>
          <thead><tr><Th>When</Th><Th>Who</Th><Th>Action</Th><Th>Record</Th><Th>Details</Th></tr></thead>
          <tbody>
            {(data ?? []).map((a) => (
              <Tr key={a.id}>
                <Td className="whitespace-nowrap">{dateTime(a.created_at)}</Td>
                <Td className="text-sm">{(a.profiles as { full_name: string; email: string } | null)?.full_name || (a.profiles as { email: string } | null)?.email || <span className="text-ink-muted">system</span>}</Td>
                <Td><Badge tone={/void|refund|failed|cancel|spoilage|delete/.test(a.action) ? "red" : /discount|override|adjust|access/.test(a.action) ? "gold" : "neutral"}>{a.action}</Badge></Td>
                <Td className="text-sm">{a.entity_type}</Td>
                <Td className="max-w-xl break-words text-xs text-ink-soft">{summarize(a.details as Record<string, unknown>)}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
