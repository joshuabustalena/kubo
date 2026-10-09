import { Gamepad2 } from "lucide-react";
import type { Metadata } from "next";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/feedback";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { requireUser } from "@/lib/auth";
import { dateTime } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Play history" };

export default async function GameHistoryPage() {
  const user = await requireUser("/account/games");
  const supabase = await createClient();
  const [{ data: sessions }, { data: games }, { data: tokenLog }] = await Promise.all([
    supabase.from("game_sessions").select("id, game_code, status, score, prize_label, started_at").eq("customer_id", user.id).order("started_at", { ascending: false }).limit(60),
    supabase.from("games").select("code, name"),
    supabase.from("game_token_ledger").select("id, tokens, reason, description, created_at").eq("customer_id", user.id).order("created_at", { ascending: false }).limit(30),
  ]);
  const tokenCard = (
    <Card className="mb-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-bamboo-300/40 px-5 py-4">
        <div>
          <p className="font-display text-2xl font-extrabold text-wood-800">{user.game_tokens} game token{user.game_tokens === 1 ? "" : "s"}</p>
          <p className="text-sm text-ink-muted">Earned when you buy meals; each Play Zone round uses a token.</p>
        </div>
        <ButtonLink href="/play" size="sm">Play</ButtonLink>
      </div>
      {(tokenLog ?? []).length ? (
        <Table>
          <thead><tr><Th>When</Th><Th>Details</Th><Th className="text-right">Tokens</Th></tr></thead>
          <tbody>
            {(tokenLog ?? []).map((t) => (
              <Tr key={t.id}>
                <Td className="whitespace-nowrap text-ink-muted">{dateTime(t.created_at)}</Td>
                <Td>{t.reason === "play" ? `Played ${t.description}` : t.description}</Td>
                <Td className={`text-right font-bold ${t.tokens > 0 ? "text-leaf-700" : "text-terracotta-600"}`}>{t.tokens > 0 ? `+${t.tokens}` : t.tokens}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      ) : null}
    </Card>
  );
  const name = new Map((games ?? []).map((g) => [g.code, g.name]));

  if (!sessions?.length) {
    return (
      <>
      {tokenCard}
      <Card>
        <EmptyState icon={<Gamepad2 />} title="No games played yet" action={<ButtonLink href="/play">Visit the Play Zone</ButtonLink>}>
          Play quick games for a chance at bonus points and coupons.
        </EmptyState>
      </Card>
      </>
    );
  }
  return (
    <>
    {tokenCard}
    <Card>
      <Table>
        <thead><tr><Th>When</Th><Th>Game</Th><Th>Score</Th><Th>Result</Th></tr></thead>
        <tbody>
          {sessions.map((s) => (
            <Tr key={s.id}>
              <Td className="whitespace-nowrap text-ink-muted">{dateTime(s.started_at)}</Td>
              <Td className="font-semibold">{name.get(s.game_code) ?? s.game_code}</Td>
              <Td>{s.game_code === "wheel" ? "—" : s.score ?? "—"}</Td>
              <Td>
                {s.status === "completed" ? (
                  <Badge tone={s.prize_label && !/try|nice|cap|ran out/i.test(s.prize_label) ? "gold" : "neutral"}>{s.prize_label}</Badge>
                ) : (
                  <Badge tone="neutral">{s.status === "expired" ? "Not finished" : "In progress"}</Badge>
                )}
              </Td>
            </Tr>
          ))}
        </tbody>
      </Table>
    </Card>
    </>
  );
}
