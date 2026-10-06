// Database tooling: applies migrations and seeds clinics and menus through Supabase's
// Management API over HTTPS (PLAN.md step 7), so no database password or direct connection is needed.
//
//   pnpm db:migrate            apply new files in supabase/migrations, in order, each in a transaction
//   pnpm db:seed               upsert both demo clinics, their staff, treatments and products from src/data
//                              (demo clients are copied per sandbox by the app, never seeded here)
//   pnpm db:status             applied migrations and row counts
//   add --print to migrate or seed to print the SQL instead of running it (for the SQL editor)
//
// Needs SUPABASE_ACCESS_TOKEN and SUPABASE_PROJECT_REF. Build tooling only: never set these in Vercel.
// Applied migrations are recorded in supabase_migrations.schema_migrations, the table the Supabase CLI uses.

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { SEED_CLINICS } from "@/data/clinics";
import { SEED_PRODUCTS, SEED_TREATMENTS } from "@/data/menu";
import { SEED_STAFF } from "@/data/staff";
import { toRow, type Row } from "@/lib/store/rows";

const MIGRATIONS_DIR = path.join(process.cwd(), "supabase", "migrations");
const TRACKING = `
create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (
  version text primary key,
  statements text[],
  name text
);
-- Not served by the Data API, but RLS on matches every other table. The owner (these tools) bypasses it.
alter table supabase_migrations.schema_migrations enable row level security;`;

const [command = "status", ...flags] = process.argv.slice(2);
const print = flags.includes("--print");

/** Dollar-quotes text so it can sit inside SQL untouched. */
function literal(text: string, tag = "rb"): string {
  let t = tag;
  while (text.includes(`$${t}$`)) t += "_";
  return `$${t}$${text}$${t}$`;
}

async function query<T = Row>(sql: string): Promise<T[]> {
  const ref = process.env.SUPABASE_PROJECT_REF;
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  if (!ref || !token) throw new Error("Set SUPABASE_PROJECT_REF and SUPABASE_ACCESS_TOKEN first.");
  const response = await fetch(`https://api.supabase.com/v1/projects/${encodeURIComponent(ref)}/database/query`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ query: sql }),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Supabase answered ${response.status}: ${text.slice(0, 500)}`);
  return (text ? JSON.parse(text) : []) as T[];
}

async function migrationFiles(): Promise<{ version: string; name: string; sql: string }[]> {
  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => /^\d{14}_[\w-]+\.sql$/.test(f)).sort();
  return Promise.all(
    files.map(async (file) => {
      const [, version, name] = file.match(/^(\d{14})_([\w-]+)\.sql$/)!;
      return { version, name, sql: await readFile(path.join(MIGRATIONS_DIR, file), "utf8") };
    }),
  );
}

function migrationSql(m: { version: string; name: string; sql: string }): string {
  return [
    "begin;",
    m.sql,
    `insert into supabase_migrations.schema_migrations (version, name, statements)
     values (${literal(m.version)}, ${literal(m.name)}, array[${literal(m.sql)}]);`,
    "commit;",
  ].join("\n");
}

async function migrate() {
  const files = await migrationFiles();
  if (print) {
    console.log([TRACKING, ...files.map(migrationSql)].join("\n\n"));
    return;
  }
  await query(TRACKING);
  const applied = new Set(
    (await query<{ version: string }>("select version from supabase_migrations.schema_migrations")).map((r) => r.version),
  );
  const pending = files.filter((f) => !applied.has(f.version));
  if (pending.length === 0) console.log("Database is up to date.");
  for (const m of pending) {
    await query(migrationSql(m));
    console.log(`Applied ${m.version}_${m.name}`);
  }
}

/** Upserts rows by id: inserts new ones and updates every column of existing ones. */
function upsertSql(table: string, rows: Row[]): string {
  const columns = Object.keys(rows[0]);
  const list = columns.join(", ");
  const updates = columns.filter((c) => c !== "id").map((c) => `${c} = excluded.${c}`).join(", ");
  return `insert into public.${table} (${list})
select ${list} from jsonb_populate_recordset(null::public.${table}, ${literal(JSON.stringify(rows))}::jsonb)
on conflict (id) do update set ${updates};`;
}

function seedSql(): string {
  const now = new Date().toISOString();
  // Optional clinic fields are written as null, so every row has the same columns.
  const clinics = SEED_CLINICS.map((c) => toRow({ monogramUrl: null, lockupUrl: null, ...c, createdAt: now }));
  const treatments = SEED_TREATMENTS.map((t, position) => toRow({ ...t, position }));
  const products = SEED_PRODUCTS.map((p, position) => toRow({ ...p, position }));
  const staff = SEED_STAFF.map((s) => toRow(s));
  return [
    "begin;",
    upsertSql("clinics", clinics),
    upsertSql("staff", staff),
    upsertSql("treatments", treatments),
    upsertSql("products", products),
    "commit;",
  ].join("\n\n");
}

async function seed() {
  const sql = seedSql();
  if (print) {
    console.log(sql);
    return;
  }
  await query(sql);
  console.log(
    `Seeded ${SEED_CLINICS.length} clinics, ${SEED_STAFF.length} staff, ${SEED_TREATMENTS.length} treatments, ${SEED_PRODUCTS.length} products.`,
  );
}

async function status() {
  await query(TRACKING);
  const applied = await query<{ version: string; name: string }>(
    "select version, name from supabase_migrations.schema_migrations order by version",
  );
  const files = await migrationFiles();
  for (const f of files) {
    console.log(`${applied.some((a) => a.version === f.version) ? "applied" : "PENDING"}  ${f.version}_${f.name}`);
  }
  const tables = [
    "clinics",
    "staff",
    "treatments",
    "products",
    "sandboxes",
    "clients",
    "scans",
    "reports",
    "plans",
    "appointments",
    "messages",
    "api_usage",
    "events",
  ];
  const exists = await query<{ table_name: string }>(
    "select table_name from information_schema.tables where table_schema = 'public'",
  );
  const present = tables.filter((t) => exists.some((e) => e.table_name === t));
  if (present.length === 0) return;
  const [counts] = await query<Record<string, number>>(
    `select ${present.map((t) => `(select count(*) from public.${t})::int as ${t}`).join(", ")}`,
  );
  console.log(Object.entries(counts).map(([t, n]) => `${t}: ${n}`).join("  "));
  const [bucket] = await query<{ public: boolean }>("select public from storage.buckets where id = 'scans'");
  console.log(bucket ? `Storage bucket "scans": ${bucket.public ? "PUBLIC (should be private)" : "private"}` : 'Storage bucket "scans": missing');
}

const commands: Record<string, () => Promise<void>> = { migrate, seed, status };
const run = commands[command];
if (!run) {
  console.error(`Unknown command "${command}". Use migrate, seed or status.`);
  process.exit(1);
}
run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
