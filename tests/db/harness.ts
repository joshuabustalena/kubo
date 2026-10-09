/**
 * In-process Postgres (PGlite) with just enough of Supabase's `auth` and
 * `storage` schemas to run the real migrations and seed, then exercise the
 * RPCs as different users (RLS included).
 */
import { PGlite, type Transaction } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

const root = join(__dirname, "..", "..", "supabase");

const SUPABASE_STUB = `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create schema extensions;
create schema storage;
grant usage on schema public, auth, extensions, storage to anon, authenticated, service_role;
create table auth.users (
  id uuid primary key,
  email text,
  raw_user_meta_data jsonb default '{}'::jsonb
);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant execute on function auth.uid() to anon, authenticated, service_role;
create table storage.buckets (
  id text primary key, name text, public boolean,
  file_size_limit bigint, allowed_mime_types text[]
);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
alter table storage.objects enable row level security;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
`;

export type Db = PGlite;

export async function createDb({ seed = true } = {}): Promise<Db> {
  const db = await PGlite.create({ extensions: { pgcrypto } });
  await db.exec(SUPABASE_STUB);
  const dir = join(root, "migrations");
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    try {
      await db.exec(readFileSync(join(dir, file), "utf8"));
    } catch (e) {
      throw new Error(`Migration ${file} failed: ${(e as Error).message}`);
    }
  }
  if (seed) {
    try {
      await db.exec(readFileSync(join(root, "seed.sql"), "utf8"));
    } catch (e) {
      throw new Error(`seed.sql failed: ${(e as Error).message}`);
    }
  }
  return db;
}

/** Creates an auth user (profile is created by trigger) and sets its role. */
export async function createUser(
  db: Db,
  opts: { name: string; role?: "admin" | "staff" | "customer"; permissions?: string[] },
): Promise<string> {
  const id = randomUUID();
  const email = `${opts.name.toLowerCase().replace(/\s+/g, ".")}.${id.slice(0, 4)}@test.local`;
  await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`, [
    id,
    email,
    JSON.stringify({ full_name: opts.name }),
  ]);
  if (opts.role && opts.role !== "customer") {
    await db.query(`update public.profiles set role = $2, permissions = $3 where id = $1`, [
      id,
      opts.role,
      opts.permissions ?? [],
    ]);
  }
  return id;
}

/** Runs `fn` as an authenticated Supabase user (RLS applies). */
export async function asUser<T>(db: Db, userId: string | null, fn: (tx: Transaction) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.exec(`set local role ${userId ? "authenticated" : "anon"}`);
    await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [userId ?? ""]);
    return fn(tx);
  });
}

/** Calls a SQL function as a user and returns the first column of the first row. */
export async function rpc<T = unknown>(db: Db, userId: string | null, sql: string, params: unknown[] = []): Promise<T> {
  return asUser(db, userId, async (tx) => {
    const res = await tx.query<Record<string, unknown>>(sql, params);
    const row = res.rows[0];
    return (row ? Object.values(row)[0] : undefined) as T;
  });
}

export async function one<T = Record<string, unknown>>(db: Db, sql: string, params: unknown[] = []): Promise<T> {
  const res = await db.query<T>(sql, params);
  return res.rows[0];
}

export async function productId(db: Db, slug: string): Promise<string> {
  return (await one<{ id: string }>(db, `select id from public.products where slug = $1`, [slug])).id;
}

export const key = () => randomUUID();
