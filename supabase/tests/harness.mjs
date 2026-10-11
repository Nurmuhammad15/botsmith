// A minimal Supabase-like harness on top of PGlite (real Postgres compiled to WebAssembly), used
// to test the SQL migrations: roles, row level security, privileges and the SQL functions.
//
//   npm install --no-save @electric-sql/pglite
//   node supabase/tests/run.mjs
//
// (--no-save keeps package.json and the lockfiles untouched; PGLITE_PATH may point at an
// existing install of the package instead.)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const migrationsDir = path.join(here, "..", "migrations");
export const migration = (name) => path.join(migrationsDir, name);

async function importPglite(subpath = "") {
  if (process.env.PGLITE_PATH) {
    const file = subpath ? `dist/${subpath}.js` : "dist/index.js";
    return import(pathToFileURL(path.join(process.env.PGLITE_PATH, file)).href);
  }
  return import(`@electric-sql/pglite${subpath ? `/${subpath}` : ""}`);
}

let pg;
try {
  pg = await importPglite();
} catch {
  pg = undefined;
}
/** False when PGlite is not installed (tests that need it should skip themselves). */
export const pgliteAvailable = pg !== undefined;
let pgcrypto;
try {
  ({ pgcrypto } = await importPglite("contrib/pgcrypto"));
} catch {
  pgcrypto = undefined;
}

// Enough of Supabase for the migrations: the three API roles, auth.users/auth.uid(), default
// privileges (Supabase grants everything to the API roles on new objects), storage tables and
// the realtime publication.
const STUBS = `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

create schema auth;
create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  raw_user_meta_data jsonb not null default '{}'::jsonb
);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;

grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;

create schema storage;
create table storage.buckets (
  id text primary key, name text not null, public boolean default false,
  file_size_limit bigint, allowed_mime_types text[]
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name text, owner uuid, metadata jsonb, created_at timestamptz default now()
);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[] language plpgsql as $$
declare _parts text[];
begin
  select string_to_array(name, '/') into _parts;
  return _parts[1:array_length(_parts, 1) - 1];
end $$;
grant usage on schema storage to anon, authenticated, service_role;
grant all on storage.objects, storage.buckets to anon, authenticated, service_role;

create publication supabase_realtime;
`;

/** Creates a database with the Supabase stubs and applies the given migration files in order. */
export async function boot({ migrations, preSql = "" } = {}) {
  if (!pg) {
    console.error(
      "PGlite is not installed. Run:  npm install --no-save @electric-sql/pglite\n" +
        "(or set PGLITE_PATH to an existing install).",
    );
    process.exit(3);
  }
  const db = new pg.PGlite(pgcrypto ? { extensions: { pgcrypto } } : {});
  await db.exec(STUBS);
  if (preSql) await db.exec(preSql);
  for (const file of migrations) {
    try {
      await db.exec(fs.readFileSync(file, "utf8"));
    } catch (e) {
      console.error(
        `MIGRATION FAILED: ${path.basename(file)}\n  ${JSON.stringify(e, Object.getOwnPropertyNames(e))}`,
      );
      process.exit(2);
    }
    console.log(`migration ok: ${path.basename(file)}`);
  }
  return db;
}

/**
 * Runs `fn(tx)` as a signed-in user (`userId`), as anonymous (null) or as the server
 * ("service"), the way PostgREST does: switch role and set the JWT claim. The transaction is
 * rolled back unless `commit` is true.
 */
export async function as(db, who, fn, { commit = false, headers = null } = {}) {
  return db.transaction(async (tx) => {
    const role = who === "service" ? "service_role" : who ? "authenticated" : "anon";
    await tx.exec(`set local role ${role}`);
    await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [
      who && who !== "service" ? who : "",
    ]);
    if (headers) {
      await tx.query(`select set_config('request.headers', $1, true)`, [JSON.stringify(headers)]);
    }
    const out = await fn(tx);
    if (!commit) await tx.rollback();
    return out;
  });
}

let passed = 0;
let failed = 0;
export async function check(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ok   ${name}`);
  } catch (e) {
    failed++;
    console.log(`  FAIL ${name}\n       ${e.message}`);
  }
}
export function summary() {
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}
export const eq = (a, b, msg = "") => {
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    throw new Error(`${msg} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
  }
};
export const truthy = (v, msg = "expected truthy") => {
  if (!v) throw new Error(msg);
};

let savepoints = 0;
/** Runs a statement in a savepoint so a failure does not poison the surrounding transaction. */
export async function sp(tx, sql, params) {
  const name = `sp_${++savepoints}`;
  await tx.exec(`savepoint ${name}`);
  try {
    const r = await tx.query(sql, params);
    await tx.exec(`release savepoint ${name}`);
    return r;
  } catch (e) {
    await tx.exec(`rollback to savepoint ${name}`);
    throw e;
  }
}

/** Asserts that `fn` rejects with an error whose message contains `text`. */
export async function rejects(fn, text) {
  try {
    await fn();
  } catch (e) {
    if (text && !String(e.message).includes(text)) {
      throw new Error(`expected error containing "${text}", got "${e.message}"`);
    }
    return;
  }
  throw new Error(`expected an error${text ? ` containing "${text}"` : ""}, but it succeeded`);
}
