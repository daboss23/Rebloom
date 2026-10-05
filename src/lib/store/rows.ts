// Converts between domain objects (camelCase, src/lib/domain.ts) and database rows (snake_case).
// Shallow on purpose: JSON columns such as `hours`, `result` and `capture_quality` keep their own shape.
// Shared by the Supabase store and the seed script, so it must not import server-only code.

import type { Clinic, Product, Treatment } from "@/lib/domain";

export type Row = Record<string, unknown>;

const toSnake = (key: string) => key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
const toCamel = (key: string) => key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());

/** Domain object (or patch) to row. Undefined fields are left out, so a patch only touches what it names. */
export function toRow(value: object): Row {
  const row: Row = {};
  for (const [key, v] of Object.entries(value)) if (v !== undefined) row[toSnake(key)] = v;
  return row;
}

/**
 * Row to domain object. Timestamps come back from Postgres as "2026-10-05T17:00:00+00:00";
 * they're normalised to the "2026-10-05T17:00:00.000Z" form the rest of the app writes.
 */
export function fromRow<T>(row: Row): T {
  const out: Row = {};
  for (const [key, v] of Object.entries(row)) {
    out[toCamel(key)] = key.endsWith("_at") && typeof v === "string" ? new Date(v).toISOString() : v;
  }
  return out as T;
}

/** Columns that exist only in the database: they never reach domain objects. */
function without(row: Row, keys: string[]): Row {
  const copy = { ...row };
  for (const key of keys) delete copy[key];
  return copy;
}

export function clinicFromRow(row: Row): Clinic {
  // Optional fields are absent, not null, in the domain type.
  const optional = ["monogram_url", "lockup_url"].filter((key) => row[key] == null);
  return fromRow<Clinic>(without(row, ["created_at", ...optional]));
}

/** Treatments and products carry a menu `position` column. */
export function menuItemFromRow<T extends Treatment | Product>(row: Row): T {
  return fromRow<T>(without(row, ["position"]));
}
