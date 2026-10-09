import { beforeAll, describe, expect, it } from "vitest";
import { createDb, createUser, one, rpc, type Db } from "./harness";

let db: Db;
let player: string;

type Secret = { deck: string[]; answers: { id: string; correct: number }[] };
type Start = { session_id: string; state: { questions: unknown[]; items: { i: number; k: string }[] }; resumed: boolean };
type Finish = { score: number; prize_type: string; points: number; label: string; replayed?: boolean; reward_code?: string };

const secret = async (sessionId: string) =>
  (await one<{ secret: Secret }>(db, `select secret from game_session_secrets where session_id = $1`, [sessionId])).secret;
const ageSession = (id: string, seconds: number) =>
  db.query(`update game_sessions set started_at = now() - make_interval(secs => $2), completed_at = null where id = $1`, [id, seconds]);
const clearCooldown = (code: string) =>
  db.query(`update game_sessions set started_at = started_at - interval '10 minutes', completed_at = completed_at - interval '10 minutes' where game_code = $1`, [code]);

beforeAll(async () => {
  db = await createDb();
  player = await createUser(db, { name: "Gamer Student" });
  await db.query(`select public.add_token_entry($1, 40, 'admin', 'test tokens', 'test:tokens')`, [player]);
}, 60_000);

const tokens = async () => (await one<{ t: number }>(db, `select game_tokens t from profiles where id = $1`, [player])).t;

describe("game tokens", () => {
  it("blocks players without tokens", async () => {
    const broke = await createUser(db, { name: "No Token Student" });
    await expect(rpc(db, broke, `select public.game_spin_wheel()`)).rejects.toThrow(/NO_TOKENS/);
    await expect(rpc(db, broke, `select public.game_start('quiz')`)).rejects.toThrow(/NO_TOKENS/);
    const s = await one<{ c: number }>(db, `select count(*)::int c from game_sessions where customer_id = $1`, [broke]);
    expect(s.c).toBe(0);
  });

  it("spends one token per new round; resuming is free", async () => {
    const before = await tokens();
    const a = await rpc<{ session_id: string }>(db, player, `select public.game_start('memory')`);
    await rpc(db, player, `select public.game_start('memory')`);
    expect(await tokens()).toBe(before - 1);
    await db.query(`update game_sessions set status = 'expired' where id = $1`, [a.session_id]);
    await db.query(`update game_sessions set started_at = now() - interval '1 day' where id = $1`, [a.session_id]);
  });
});

describe("Lucky Kubo Wheel", () => {
  it("spins once per day and the server picks the prize", async () => {
    const r = await rpc<Finish & { slice_index: number }>(db, player, `select public.game_spin_wheel()`);
    expect(r.slice_index).toBeGreaterThanOrEqual(0);
    const rewards = await db.query(`select * from game_rewards`);
    expect(rewards.rows).toHaveLength(1);
    await expect(rpc(db, player, `select public.game_spin_wheel()`)).rejects.toThrow(/plays of Lucky Kubo Wheel today/);
  });

  it("requires login", async () => {
    await expect(rpc(db, null, `select public.game_spin_wheel()`)).rejects.toThrow(/permission denied|log in/);
  });
});

describe("Food Quiz", () => {
  it("never sends answers, grades on the server and pays out once", async () => {
    const start = await rpc<Start>(db, player, `select public.game_start('quiz')`);
    expect(start.state.questions).toHaveLength(5);
    expect(JSON.stringify(start.state)).not.toMatch(/correct/);
    const s = await secret(start.session_id);
    const answers = s.answers.map((a) => a.correct);
    const res = await rpc<Finish>(db, player, `select public.game_finish($1, $2::jsonb)`, [start.session_id, JSON.stringify({ answers })]);
    expect(res.score).toBe(5);
    expect(res.points).toBe(2);
    const again = await rpc<Finish>(db, player, `select public.game_finish($1, $2::jsonb)`, [start.session_id, JSON.stringify({ answers })]);
    expect(again.replayed).toBe(true);
    const ledger = await db.query(`select * from loyalty_ledger where game_session_id = $1`, [start.session_id]);
    expect(ledger.rows).toHaveLength(1);
  });

  it("enforces the cooldown between rounds", async () => {
    await expect(rpc(db, player, `select public.game_start('quiz')`)).rejects.toThrow(/COOLDOWN/);
  });

  it("caps daily points", async () => {
    await clearCooldown("quiz");
    const start = await rpc<Start>(db, player, `select public.game_start('quiz')`);
    const s = await secret(start.session_id);
    const res = await rpc<Finish>(db, player, `select public.game_finish($1, $2::jsonb)`, [
      start.session_id, JSON.stringify({ answers: s.answers.map((a) => a.correct) })]);
    expect(res.points).toBe(2); // cap is 4: 2 + 2
    await clearCooldown("quiz");
    await expect(rpc(db, player, `select public.game_start('quiz')`)).rejects.toThrow(/plays/); // limit 2/day
  });
});

describe("Kubo Memory Match", () => {
  it("reveals cards one flip at a time and scores by moves", async () => {
    const start = await rpc<Start>(db, player, `select public.game_start('memory')`);
    expect(JSON.stringify(start.state)).not.toMatch(/rice|hotdog/);
    // Starting again resumes the same round rather than creating a new one
    const resumed = await rpc<Start>(db, player, `select public.game_start('memory')`);
    expect(resumed.session_id).toBe(start.session_id);
    await expect(rpc(db, player, `select public.game_finish($1, '{}'::jsonb)`, [start.session_id])).rejects.toThrow(/Match all/);

    const deck: string[] = (await secret(start.session_id)).deck;
    const pairs = new Map<string, number[]>();
    deck.forEach((sym, i) => pairs.set(sym, [...(pairs.get(sym) ?? []), i]));
    for (const [a, b] of pairs.values()) {
      await db.query(`update game_session_secrets set secret = jsonb_set(secret, '{last_flip_ms}', '0') where session_id = $1`, [start.session_id]);
      await rpc(db, player, `select public.game_memory_flip($1, $2)`, [start.session_id, a]);
      await db.query(`update game_session_secrets set secret = jsonb_set(secret, '{last_flip_ms}', '0') where session_id = $1`, [start.session_id]);
      const r = await rpc<{ match: boolean }>(db, player, `select public.game_memory_flip($1, $2)`, [start.session_id, b]);
      expect(r.match).toBe(true);
    }
    const res = await rpc<Finish>(db, player, `select public.game_finish($1, '{}'::jsonb)`, [start.session_id]);
    expect(res.score).toBe(100);
    expect(res.prize_type).toBe("reward");
    expect(res.reward_code).toMatch(/^JK-/);
  });
});

describe("Java Catch", () => {
  it("rejects early finishes and only counts rice that actually dropped", async () => {
    const start = await rpc<Start>(db, player, `select public.game_start('catch')`);
    const items: { i: number; k: string }[] = start.state.items;
    await expect(
      rpc(db, player, `select public.game_finish($1, $2::jsonb)`, [start.session_id, JSON.stringify({ caught: [0], hits: 0 })]),
    ).rejects.toThrow(/not over yet/);
    await ageSession(start.session_id, 31);
    // Claim every item, including rocks and duplicates: only rice/gold count
    const all = items.map((x) => x.i);
    const res = await rpc<Finish>(db, player, `select public.game_finish($1, $2::jsonb)`, [
      start.session_id, JSON.stringify({ caught: [...all, ...all, 9999, "x"], hits: 1 })]);
    const expected = items.reduce((s, x) => s + (x.k === "rice" ? 1 : x.k === "gold" ? 3 : 0), 0) - 2;
    expect(res.score).toBe(Math.max(expected, 0));
  });

  it("disabled games cannot be played", async () => {
    await db.query(`update games set is_enabled = false where code = 'catch'`);
    await clearCooldown("catch");
    await expect(rpc(db, player, `select public.game_start('catch')`)).rejects.toThrow(/closed/);
  });
});
