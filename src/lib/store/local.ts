import "server-only";
// A small JSON-file store so the whole app runs with no keys (DECISIONS D-017).
// Data lives in ./.data locally, or in the server's temp folder on a Vercel preview,
// where it can reset between requests. Not for production.

import { createHmac, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { SEED_CLINICS } from "@/data/clinics";
import { SEED_PRODUCTS, SEED_TREATMENTS } from "@/data/menu";
import { SEED_STAFF } from "@/data/staff";
import type { ApiUsage, Appointment, Client, ClientPlan, Consent, Intake, Message, PlanItem, Report, Sandbox, Scan } from "@/lib/domain";
import { localSecret } from "@/lib/env";
import { newId, newToken } from "@/lib/ids";
import { scanStoragePaths } from "./scan-paths";
import type { ObjectStorage, Store, UploadTarget } from "./types";

interface Db {
  sandboxes: Sandbox[];
  clients: Client[];
  consents: Consent[];
  intakes: Intake[];
  scans: Scan[];
  reports: Report[];
  plans: ClientPlan[];
  planItems: PlanItem[];
  appointments: Appointment[];
  messages: Message[];
  usage: ApiUsage[];
  events: { id: string; clinicId: string; sandboxId: string | null; type: string; createdAt: string }[];
}

const emptyDb = (): Db => ({
  sandboxes: [],
  clients: [],
  consents: [],
  intakes: [],
  scans: [],
  reports: [],
  plans: [],
  planItems: [],
  appointments: [],
  messages: [],
  usage: [],
  events: [],
});

/** Removes clients and everything that hangs off them, as the database's on delete cascade does. */
function dropClients(db: Db, ids: Set<string>): void {
  const plans = new Set(db.plans.filter((p) => ids.has(p.clientId)).map((p) => p.id));
  db.clients = db.clients.filter((c) => !ids.has(c.id));
  db.consents = db.consents.filter((c) => !ids.has(c.clientId));
  db.intakes = db.intakes.filter((i) => !ids.has(i.clientId));
  db.scans = db.scans.filter((s) => !ids.has(s.clientId));
  db.reports = db.reports.filter((r) => !ids.has(r.clientId));
  db.plans = db.plans.filter((p) => !plans.has(p.id));
  db.planItems = db.planItems.filter((i) => !plans.has(i.planId));
  db.appointments = db.appointments.filter((a) => !ids.has(a.clientId));
  db.messages = db.messages.filter((m) => !ids.has(m.clientId));
}

export const LOCAL_DIR =
  process.env.REBLOOM_DATA_DIR ?? (process.env.VERCEL ? path.join(os.tmpdir(), "rebloom") : path.join(process.cwd(), ".data"));
const DB_FILE = path.join(LOCAL_DIR, "db.json");
const UPLOADS = path.join(LOCAL_DIR, "uploads");

// Shared across Next's server bundles within one process.
const state = ((globalThis as { __rebloomLocal?: { queue: Promise<unknown> } }).__rebloomLocal ??= {
  queue: Promise.resolve(),
});

async function load(): Promise<Db> {
  try {
    return { ...emptyDb(), ...(JSON.parse(await readFile(DB_FILE, "utf8")) as Partial<Db>) };
  } catch {
    return emptyDb();
  }
}

async function save(db: Db): Promise<void> {
  await mkdir(LOCAL_DIR, { recursive: true });
  const tmp = `${DB_FILE}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(db));
  await rename(tmp, DB_FILE);
}

/** Runs one read or read-modify-write at a time, so concurrent requests can't clobber each other. */
function tx<T>(fn: (db: Db) => T | Promise<T>, write = false): Promise<T> {
  const run = state.queue.then(async () => {
    const db = await load();
    const result = await fn(db);
    if (write) await save(db);
    return result;
  });
  state.queue = run.catch(() => undefined);
  return run;
}

function must<T>(value: T | undefined, what: string): T {
  if (!value) throw new Error(`${what} not found`);
  return value;
}

export const localStore: Store = {
  kind: "local",

  async listClinics() {
    return SEED_CLINICS;
  },
  async getClinicBySlug(slug) {
    return SEED_CLINICS.find((c) => c.slug === slug) ?? null;
  },
  async getClinic(id) {
    return SEED_CLINICS.find((c) => c.id === id) ?? null;
  },
  async listTreatments(clinicId) {
    return SEED_TREATMENTS.filter((t) => t.clinicId === clinicId && t.active);
  },
  async listProducts(clinicId) {
    return SEED_PRODUCTS.filter((p) => p.clinicId === clinicId && p.active);
  },
  async listStaff(clinicId) {
    return SEED_STAFF.filter((s) => s.clinicId === clinicId);
  },

  getSandbox: (id) => tx((db) => db.sandboxes.find((s) => s.id === id) ?? null),
  createSandbox: (id, now) =>
    tx((db) => {
      const existing = db.sandboxes.find((s) => s.id === id);
      if (existing) return existing;
      const sandbox: Sandbox = { id, createdAt: now.toISOString(), clockOffsetDays: 0 };
      db.sandboxes.push(sandbox);
      return sandbox;
    }, true),
  expiredSandboxes: (before, limit) =>
    tx((db) => {
      const ids = db.sandboxes
        .filter((s) => new Date(s.createdAt) < before)
        .slice(0, limit)
        .map((s) => s.id);
      return { ids, storagePaths: scanStoragePaths(db.scans.filter((s) => s.sandboxId && ids.includes(s.sandboxId))) };
    }),
  deleteSandboxes: (ids) =>
    tx((db) => {
      const gone = new Set(ids);
      db.sandboxes = db.sandboxes.filter((s) => !gone.has(s.id));
      dropClients(db, new Set(db.clients.filter((c) => c.sandboxId && gone.has(c.sandboxId)).map((c) => c.id)));
      db.events = db.events.filter((e) => !(e.sandboxId && gone.has(e.sandboxId)));
      // Usage stays, so spent units keep counting against the budget.
    }, true),
  setClockOffset: (sandboxId, days) =>
    tx((db) => {
      const sandbox = must(db.sandboxes.find((s) => s.id === sandboxId), "Sandbox");
      if (!Number.isInteger(days) || days < sandbox.clockOffsetDays) throw new Error("The demo clock only moves forward.");
      sandbox.clockOffsetDays = days;
      return sandbox;
    }, true),
  seedDemoClients: (clinicId, sandboxId, bundle) =>
    tx((db) => {
      if (db.clients.some((c) => c.clinicId === clinicId && c.sandboxId === sandboxId && c.demoKey)) return false;
      db.clients.push(...bundle.clients);
      db.consents.push(...bundle.consents);
      db.intakes.push(...bundle.intakes);
      db.scans.push(...bundle.scans);
      db.reports.push(...bundle.reports);
      db.plans.push(...bundle.plans);
      db.planItems.push(...bundle.planItems);
      db.appointments.push(...bundle.appointments);
      db.messages.push(...bundle.messages);
      return true;
    }, true),

  createClient: ({ clinicId, sandboxId, now }) =>
    tx((db) => {
      const client: Client = {
        id: newId(),
        clinicId,
        sandboxId,
        firstName: null,
        email: null,
        phone: null,
        lastName: null,
        ageRange: null,
        status: "started",
        isDemo: false,
        demoKey: null,
        createdAt: now.toISOString(),
      };
      db.clients.push(client);
      return client;
    }, true),
  getClient: (id) => tx((db) => db.clients.find((c) => c.id === id) ?? null),
  updateClient: (id, patch) =>
    tx((db) => {
      const client = must(db.clients.find((c) => c.id === id), "Client");
      Object.assign(client, patch);
      return client;
    }, true),
  listClients: (clinicId, sandboxId) =>
    tx((db) =>
      db.clients
        .filter((c) => c.clinicId === clinicId && c.sandboxId === sandboxId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    ),

  listPlans: (clientId) =>
    tx((db) =>
      db.plans
        .filter((p) => p.clientId === clientId)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .map((p) => ({ ...p, items: db.planItems.filter((i) => i.planId === p.id).sort((a, b) => a.position - b.position) })),
    ),
  listAppointments: (clinicId, sandboxId) =>
    tx((db) =>
      db.appointments
        .filter((a) => a.clinicId === clinicId && a.sandboxId === sandboxId)
        .sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
    ),
  listMessages: (clinicId, sandboxId) =>
    tx((db) =>
      db.messages
        .filter((m) => m.clinicId === clinicId && m.sandboxId === sandboxId)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    ),

  addConsent: (input) =>
    tx((db) => {
      const consent: Consent = { id: newId(), ...input };
      db.consents.push(consent);
      return consent;
    }, true),
  listConsents: (clientId) => tx((db) => db.consents.filter((c) => c.clientId === clientId)),

  getIntake: (clientId) => tx((db) => db.intakes.find((i) => i.clientId === clientId) ?? null),
  saveIntake: (clientId, patch, now) =>
    tx((db) => {
      let intake = db.intakes.find((i) => i.clientId === clientId);
      if (!intake) {
        intake = {
          clientId,
          concerns: [],
          concernsOther: null,
          goalText: null,
          hasEvent: null,
          eventType: null,
          eventDate: null,
          pastTreatments: [],
          budgetBand: null,
          screening: {},
          sensitivitiesNote: null,
          completedAt: null,
          updatedAt: now.toISOString(),
        };
        db.intakes.push(intake);
      }
      Object.assign(intake, patch, { updatedAt: now.toISOString() });
      return intake;
    }, true),

  createScan: (input, now) =>
    tx((db) => {
      const previous = db.scans.filter((s) => s.clientId === input.clientId && s.status === "complete").length;
      const scan: Scan = {
        id: newId(),
        ...input,
        scanNumber: previous + 1,
        status: "uploading",
        source: "fixture",
        providerTaskId: null,
        analysisStartedAt: null,
        errorCode: null,
        youcamRaw: null,
        result: null,
        comparisonConfidence: null,
        createdAt: now.toISOString(),
        completedAt: null,
      };
      db.scans.push(scan);
      return scan;
    }, true),
  getScan: (id) => tx((db) => db.scans.find((s) => s.id === id) ?? null),
  listScans: (clientId) =>
    tx((db) => db.scans.filter((s) => s.clientId === clientId).sort((a, b) => a.createdAt.localeCompare(b.createdAt))),
  transitionScan: (id, from, patch) =>
    tx((db) => {
      const scan = db.scans.find((s) => s.id === id);
      if (!scan || !from.includes(scan.status)) return null;
      Object.assign(scan, patch);
      return scan;
    }, true),
  updateScan: (id, patch) =>
    tx((db) => {
      const scan = must(db.scans.find((s) => s.id === id), "Scan");
      Object.assign(scan, patch);
      return scan;
    }, true),

  getOrCreateReport: (clientId, now) =>
    tx((db) => {
      const existing = db.reports.find((r) => r.clientId === clientId);
      if (existing) return existing;
      const report: Report = {
        id: newId(),
        clientId,
        token: newToken(),
        content: null,
        practitionerNote: null,
        version: 1,
        updatedAt: now.toISOString(),
      };
      db.reports.push(report);
      return report;
    }, true),
  getReportByToken: (token) => tx((db) => db.reports.find((r) => r.token === token) ?? null),
  updateReportContent: (reportId, content, expectedUpdatedAt) =>
    tx((db) => {
      const report = db.reports.find((r) => r.id === reportId);
      if (!report || report.updatedAt !== expectedUpdatedAt) return false;
      // Strictly later than the last write, so two writes in the same millisecond can't both match.
      const next = Math.max(Date.now(), Date.parse(report.updatedAt) + 1);
      Object.assign(report, { content, updatedAt: new Date(next).toISOString() });
      return true;
    }, true),

  deleteClientData: (clientId, now) =>
    tx((db) => {
      const client = db.clients.find((c) => c.id === clientId);
      if (!client) return { storagePaths: [] };
      const storagePaths = scanStoragePaths(db.scans.filter((s) => s.clientId === clientId));
      dropClients(db, new Set([clientId]));
      db.events.push({
        id: newId(),
        clinicId: client.clinicId,
        sandboxId: client.sandboxId,
        type: "client_deleted",
        createdAt: now.toISOString(),
      });
      return { storagePaths };
    }, true),

  logUsage: (usage) =>
    tx((db) => {
      db.usage.push({ id: newId(), ...usage });
    }, true),
  settleUsage: ({ provider, taskId }, units) =>
    tx((db) => {
      for (const u of db.usage) if (u.provider === provider && u.taskId === taskId) u.units = units;
    }, true),
  sumUsage: ({ provider, since, sandboxId, ipHash }) =>
    tx((db) => {
      const rows = db.usage.filter(
        (u) =>
          u.provider === provider &&
          new Date(u.createdAt) >= since &&
          (sandboxId === undefined || u.sandboxId === sandboxId) &&
          (ipHash === undefined || u.ipHash === ipHash),
      );
      return { units: rows.reduce((n, u) => n + u.units, 0), count: rows.length };
    }),
};

// ---------- Local object storage with signed URLs (mirrors Supabase's flow) ----------

const UPLOAD_TTL_MS = 10 * 60_000;

function safePath(p: string): string {
  const normalized = path.posix.normalize(p).replace(/^\/+/, "");
  if (normalized.startsWith("..") || normalized.includes("\0")) throw new Error("Bad storage path");
  return normalized;
}

export function signLocal(method: string, objectPath: string, expires: number): string {
  return createHmac("sha256", localSecret()).update(`${method}:${objectPath}:${expires}`).digest("base64url");
}

export function verifyLocal(method: string, objectPath: string, expires: number, sig: string): boolean {
  if (!Number.isFinite(expires) || Date.now() > expires) return false;
  const expected = Buffer.from(signLocal(method, objectPath, expires));
  const given = Buffer.from(sig);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export const localObjectStorage: ObjectStorage = {
  async createUploadUrl(objectPath, contentType): Promise<UploadTarget> {
    const p = safePath(objectPath);
    const expires = Date.now() + UPLOAD_TTL_MS;
    const qs = new URLSearchParams({ path: p, exp: String(expires), sig: signLocal("PUT", p, expires) });
    return { url: `/api/storage/local?${qs}`, method: "PUT", headers: { "content-type": contentType } };
  },
  async put(objectPath, bytes, contentType) {
    const file = path.join(UPLOADS, safePath(objectPath));
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, bytes);
    await writeFile(`${file}.type`, contentType);
  },
  async get(objectPath) {
    const file = path.join(UPLOADS, safePath(objectPath));
    try {
      const [bytes, contentType] = await Promise.all([readFile(file), readFile(`${file}.type`, "utf8")]);
      return { bytes, contentType };
    } catch {
      return null;
    }
  },
  async remove(paths) {
    await Promise.all(
      paths.flatMap((p) => {
        const file = path.join(UPLOADS, safePath(p));
        return [rm(file, { force: true }), rm(`${file}.type`, { force: true })];
      }),
    );
  },
};
