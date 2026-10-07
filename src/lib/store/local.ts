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
import { DEFAULT_CLINIC_SETTINGS, type ApiUsage, type Appointment, type Client, type ClientPlan, type ClinicSettings, type Consent, type Intake, type Message, type PlanItem, type Report, type Sandbox, type Scan } from "@/lib/domain";
import { localSecret } from "@/lib/env";
import { newId, newToken } from "@/lib/ids";
import { scanStoragePaths } from "./scan-paths";
import { SlotTakenError, type ObjectStorage, type Store, type UploadTarget } from "./types";

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
  settings: (ClinicSettings & { clinicId: string; sandboxId: string | null; updatedAt: string })[];
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
  settings: [],
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

/** As the database's appointments_no_overlap constraint: one booked visit at a time per clinic and sandbox. */
function overlapsBooked(db: Db, a: Appointment): boolean {
  return db.appointments.some(
    (b) =>
      b.id !== a.id &&
      b.status === "booked" &&
      b.clinicId === a.clinicId &&
      b.sandboxId === a.sandboxId &&
      Date.parse(b.startsAt) < Date.parse(a.endsAt) &&
      Date.parse(a.startsAt) < Date.parse(b.endsAt),
  );
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
  getClinicSettings: (clinicId, sandboxId) =>
    tx((db) => {
      const row = db.settings.find((r) => r.clinicId === clinicId && r.sandboxId === sandboxId);
      return { ...DEFAULT_CLINIC_SETTINGS, ...(row ? { depositRequired: row.depositRequired } : {}) };
    }),
  setClinicSettings: (clinicId, sandboxId, patch, now) =>
    tx((db) => {
      let row = db.settings.find((r) => r.clinicId === clinicId && r.sandboxId === sandboxId);
      if (!row) db.settings.push((row = { ...DEFAULT_CLINIC_SETTINGS, clinicId, sandboxId, updatedAt: now.toISOString() }));
      Object.assign(row, patch, { updatedAt: now.toISOString() });
      return { depositRequired: row.depositRequired };
    }, true),

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
      db.settings = db.settings.filter((s) => !(s.sandboxId && gone.has(s.sandboxId)));
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
  getAppointment: (id) => tx((db) => db.appointments.find((a) => a.id === id) ?? null),
  addAppointment: (appointment) =>
    tx((db) => {
      if (overlapsBooked(db, appointment)) throw new SlotTakenError();
      db.appointments.push(appointment);
      return appointment;
    }, true),
  transitionAppointment: (id, from, patch) =>
    tx((db) => {
      const appointment = db.appointments.find((a) => a.id === id);
      if (!appointment || !from.status.includes(appointment.status)) return null;
      if (from.depositStatus && !from.depositStatus.includes(appointment.depositStatus)) return null;
      const next = { ...appointment, ...patch };
      if (next.status === "booked" && appointment.status !== "booked" && overlapsBooked(db, next)) throw new SlotTakenError();
      Object.assign(appointment, patch);
      return appointment;
    }, true),
  listMessages: (clinicId, sandboxId) =>
    tx((db) =>
      db.messages
        .filter((m) => m.clinicId === clinicId && m.sandboxId === sandboxId)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    ),
  listClinicRecords: (clinicId, sandboxId) =>
    tx((db) => {
      const clients = db.clients
        .filter((c) => c.clinicId === clinicId && c.sandboxId === sandboxId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      const ids = new Set(clients.map((c) => c.id));
      const mine = <T extends { clientId: string }>(rows: T[]) => rows.filter((r) => ids.has(r.clientId));
      const byTime = <T extends { createdAt: string }>(rows: T[]) => [...rows].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      return {
        clients,
        consents: mine(db.consents),
        intakes: mine(db.intakes),
        scans: byTime(mine(db.scans)),
        reports: mine(db.reports),
        plans: byTime(mine(db.plans)).map((p) => ({
          ...p,
          items: db.planItems.filter((i) => i.planId === p.id).sort((a, b) => a.position - b.position),
        })),
        appointments: db.appointments
          .filter((a) => a.clinicId === clinicId && a.sandboxId === sandboxId)
          .sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
        messages: byTime(db.messages.filter((m) => m.clinicId === clinicId && m.sandboxId === sandboxId)),
      };
    }),
  addMessage: (input) =>
    tx((db) => {
      if (input.dedupeKey && db.messages.some((m) => m.clientId === input.clientId && m.dedupeKey === input.dedupeKey)) return null;
      const message: Message = { id: newId(), ...input };
      db.messages.push(message);
      return message;
    }, true),
  updateMessage: (id, patch) =>
    tx((db) => {
      Object.assign(must(db.messages.find((m) => m.id === id), "Message"), patch);
    }, true),
  removeSkippedMessage: (clientId, dedupeKey) =>
    tx((db) => {
      const before = db.messages.length;
      db.messages = db.messages.filter((m) => !(m.clientId === clientId && m.dedupeKey === dedupeKey && m.status === "skipped"));
      return db.messages.length < before;
    }, true),
  createPlan: (plan, items) =>
    tx((db) => {
      const live = db.plans.some((p) => p.clientId === plan.clientId && (p.status === "proposed" || p.status === "confirmed"));
      if (live && (plan.status === "proposed" || plan.status === "confirmed")) return null;
      db.plans.push(plan);
      db.planItems.push(...items);
      return { ...plan, items: [...items].sort((a, b) => a.position - b.position) };
    }, true),
  confirmPlan: (planId, staffId, now) =>
    tx((db) => {
      const plan = db.plans.find((p) => p.id === planId);
      if (!plan || plan.status !== "proposed") return null;
      Object.assign(plan, { status: "confirmed", confirmedBy: staffId, confirmedAt: now.toISOString() });
      return plan;
    }, true),
  setPractitionerNote: (clientId, note) =>
    tx((db) => {
      const report = must(db.reports.find((r) => r.clientId === clientId), "Report");
      report.practitionerNote = note;
      return report;
    }, true),

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
