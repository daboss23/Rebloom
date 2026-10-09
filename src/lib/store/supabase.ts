import "server-only";
// The production store: Supabase Postgres and a private Storage bucket (PLAN.md step 7).
// Talks to the database with the service role from the server only. Row level security is on
// for every table with no policies, so the public keys can read nothing (see the migration).

import { createClient, type PostgrestError, type SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_CLINIC_SETTINGS, type Appointment, type Client, type ClientPlan, type Consent, type Intake, type Message, type PlanItem, type Report, type Sandbox, type Scan, type Staff } from "@/lib/domain";
import { env, supabaseSecretKey } from "@/lib/env";
import { newId, newToken } from "@/lib/ids";
import { toUsE164 } from "@/lib/sms/text";
import { clinicFromRow, fromRow, menuItemFromRow, toRow, type Row } from "./rows";
import { scanStoragePaths } from "./scan-paths";
import { SlotTakenError, type ObjectStorage, type PlanWithItems, type Store, type UploadTarget } from "./types";

export const SCANS_BUCKET = "scans";

let cached: SupabaseClient | undefined;

function db(): SupabaseClient {
  if (!cached) {
    const url = env.NEXT_PUBLIC_SUPABASE_URL;
    const key = supabaseSecretKey();
    if (!url || !key) throw new Error("Supabase is not configured.");
    cached = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  }
  return cached;
}

// Ids arrive from cookies and URLs. Anything that isn't a UUID can't match a row, and would
// otherwise make Postgres throw "invalid input syntax for type uuid".
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (id: string) => UUID.test(id);

type Result<T> = { data: T | null; error: PostgrestError | null };

function check<T>({ data, error }: Result<T>, what: string): T {
  if (error) throw new Error(`${what}: ${error.message}`);
  return data as T;
}

function one<T>(result: Result<Row>, what: string): T {
  const row = check(result, what);
  if (!row) throw new Error(`${what}: not found`);
  return fromRow<T>(row);
}

function maybe<T>(result: Result<Row>, what: string): T | null {
  const row = check(result, what);
  return row ? fromRow<T>(row) : null;
}

const many = <T>(result: Result<Row[]>, what: string): T[] => (check(result, what) ?? []).map((r) => fromRow<T>(r));

const UNIQUE_VIOLATION = "23505";
/** appointments_no_overlap: another booked visit has that time. */
const EXCLUSION_VIOLATION = "23P01";

export const supabaseStore: Store = {
  kind: "supabase",

  async listClinics() {
    const rows = check(await db().from("clinics").select("*").order("slug"), "listClinics");
    return (rows ?? []).map(clinicFromRow);
  },
  async getClinicBySlug(slug) {
    const row = check(await db().from("clinics").select("*").eq("slug", slug).maybeSingle(), "getClinicBySlug");
    return row ? clinicFromRow(row) : null;
  },
  async getClinic(id) {
    if (!isUuid(id)) return null;
    const row = check(await db().from("clinics").select("*").eq("id", id).maybeSingle(), "getClinic");
    return row ? clinicFromRow(row) : null;
  },
  async listTreatments(clinicId) {
    const rows = check(
      await db().from("treatments").select("*").eq("clinic_id", clinicId).eq("active", true).order("position"),
      "listTreatments",
    );
    return (rows ?? []).map((r) => menuItemFromRow(r));
  },
  async listProducts(clinicId) {
    const rows = check(
      await db().from("products").select("*").eq("clinic_id", clinicId).eq("active", true).order("position"),
      "listProducts",
    );
    return (rows ?? []).map((r) => menuItemFromRow(r));
  },
  async listStaff(clinicId) {
    return many<Staff>(await db().from("staff").select("*").eq("clinic_id", clinicId).order("created_at").order("name"), "listStaff");
  },
  async getClinicSettings(clinicId, sandboxId) {
    if (sandboxId !== null && !isUuid(sandboxId)) return { ...DEFAULT_CLINIC_SETTINGS };
    let query = db().from("clinic_settings").select("deposit_required").eq("clinic_id", clinicId);
    query = sandboxId === null ? query.is("sandbox_id", null) : query.eq("sandbox_id", sandboxId);
    const row = check(await query.maybeSingle(), "getClinicSettings") as Row | null;
    return { ...DEFAULT_CLINIC_SETTINGS, ...(row ? { depositRequired: Boolean(row.deposit_required) } : {}) };
  },
  async setClinicSettings(clinicId, sandboxId, patch, now) {
    const current = await supabaseStore.getClinicSettings(clinicId, sandboxId);
    const next = { ...current, ...patch };
    const row = check(
      await db()
        .from("clinic_settings")
        .upsert({ clinic_id: clinicId, sandbox_id: sandboxId, deposit_required: next.depositRequired, updated_at: now.toISOString() }, { onConflict: "clinic_id,sandbox_id" })
        .select("deposit_required")
        .single(),
      "setClinicSettings",
    ) as Row;
    return { depositRequired: Boolean(row.deposit_required) };
  },

  async getSandbox(id) {
    if (!isUuid(id)) return null;
    return maybe<Sandbox>(await db().from("sandboxes").select("*").eq("id", id).maybeSingle(), "getSandbox");
  },
  async createSandbox(id, now) {
    const row: Sandbox = { id, createdAt: now.toISOString(), clockOffsetDays: 0 };
    // Two first requests from one browser can race; the second keeps the first one's row.
    check(await db().from("sandboxes").upsert(toRow(row), { onConflict: "id", ignoreDuplicates: true }), "createSandbox");
    return one<Sandbox>(await db().from("sandboxes").select("*").eq("id", id).single(), "createSandbox");
  },
  async expiredSandboxes(before, limit) {
    const sandboxes = many<Sandbox>(
      await db().from("sandboxes").select("id").lt("created_at", before.toISOString()).order("created_at").limit(limit),
      "expiredSandboxes",
    );
    const ids = sandboxes.map((s) => s.id);
    if (ids.length === 0) return { ids, storagePaths: [] };
    const scans = many<Pick<Scan, "imagePath" | "result">>(
      await db().from("scans").select("image_path, result").in("sandbox_id", ids),
      "expiredSandboxes scans",
    );
    return { ids, storagePaths: scanStoragePaths(scans) };
  },
  async deleteSandboxes(ids) {
    if (ids.length === 0) return;
    // Clients, consents, intakes, scans, reports and events go with the sandbox (on delete cascade).
    check(await db().from("sandboxes").delete().in("id", ids), "deleteSandboxes");
  },
  async setClockOffset(sandboxId, days) {
    if (!Number.isInteger(days) || days < 0) throw new Error("The demo clock only moves forward.");
    // Only forward: a stale tab can't wind back a clock another tab already moved.
    const moved = maybe<Sandbox>(
      await db().from("sandboxes").update({ clock_offset_days: days }).eq("id", sandboxId).lte("clock_offset_days", days).select().maybeSingle(),
      "setClockOffset",
    );
    if (!moved) throw new Error("The demo clock only moves forward.");
    return moved;
  },
  async seedDemoClients(clinicId, sandboxId, bundle) {
    // Rows in the database's own column order and names, so the function can insert them whole.
    const rows = (items: object[]) => items.map((item) => toRow(item));
    const seeded = check(
      await db().rpc("seed_demo_clients", {
        p_clinic_id: clinicId,
        p_sandbox_id: sandboxId,
        p_bundle: {
          clients: rows(bundle.clients),
          consents: rows(bundle.consents),
          intakes: rows(bundle.intakes),
          scans: rows(bundle.scans),
          reports: rows(bundle.reports),
          plans: rows(bundle.plans),
          plan_items: rows(bundle.planItems),
          appointments: rows(bundle.appointments),
          messages: rows(bundle.messages),
        },
      }),
      "seedDemoClients",
    );
    return seeded === true;
  },

  async createClient({ clinicId, sandboxId, now }) {
    const client: Client = {
      id: newId(),
      clinicId,
      sandboxId,
      firstName: null,
      lastName: null,
      email: null,
      phone: null,
      ageRange: null,
      status: "started",
      isDemo: false,
      demoKey: null,
      createdAt: now.toISOString(),
    };
    return one<Client>(await db().from("clients").insert(toRow(client)).select().single(), "createClient");
  },
  async getClient(id) {
    if (!isUuid(id)) return null;
    return maybe<Client>(await db().from("clients").select("*").eq("id", id).maybeSingle(), "getClient");
  },
  async updateClient(id, patch) {
    return one<Client>(await db().from("clients").update(toRow(patch)).eq("id", id).select().single(), "updateClient");
  },
  async listClients(clinicId, sandboxId) {
    if (!isUuid(sandboxId)) return [];
    return many<Client>(
      await db().from("clients").select("*").eq("clinic_id", clinicId).eq("sandbox_id", sandboxId).order("created_at", { ascending: false }),
      "listClients",
    );
  },

  async listPlans(clientId) {
    if (!isUuid(clientId)) return [];
    const rows = check(
      await db()
        .from("plans")
        .select("*, plan_items(*)")
        .eq("client_id", clientId)
        .order("created_at")
        .order("position", { referencedTable: "plan_items" }),
      "listPlans",
    );
    return (rows ?? []).map(({ plan_items, ...plan }): PlanWithItems => ({
      ...fromRow<ClientPlan>(plan),
      items: ((plan_items as Row[] | null) ?? []).map((i) => fromRow<PlanItem>(i)),
    }));
  },
  async listAppointments(clinicId, sandboxId) {
    if (!isUuid(sandboxId)) return [];
    return many<Appointment>(
      await db().from("appointments").select("*").eq("clinic_id", clinicId).eq("sandbox_id", sandboxId).order("starts_at"),
      "listAppointments",
    );
  },
  async getAppointment(id) {
    if (!isUuid(id)) return null;
    return maybe<Appointment>(await db().from("appointments").select("*").eq("id", id).maybeSingle(), "getAppointment");
  },
  async addAppointment(appointment) {
    const inserted = await db().from("appointments").insert(toRow(appointment)).select().single();
    if (inserted.error?.code === EXCLUSION_VIOLATION) throw new SlotTakenError();
    return one<Appointment>(inserted, "addAppointment");
  },
  async transitionAppointment(id, from, patch) {
    if (!isUuid(id)) return null;
    // One conditional UPDATE: of two requests settling the same visit, exactly one matches.
    let query = db().from("appointments").update(toRow(patch)).eq("id", id).in("status", from.status);
    if (from.depositStatus) query = query.in("deposit_status", from.depositStatus);
    const updated = await query.select().maybeSingle();
    if (updated.error?.code === EXCLUSION_VIOLATION) throw new SlotTakenError();
    return maybe<Appointment>(updated, "transitionAppointment");
  },
  async listMessages(clinicId, sandboxId) {
    if (!isUuid(sandboxId)) return [];
    return many<Message>(
      await db().from("messages").select("*").eq("clinic_id", clinicId).eq("sandbox_id", sandboxId).order("created_at"),
      "listMessages",
    );
  },
  async listClientMessages(clientId) {
    if (!isUuid(clientId)) return [];
    return many<Message>(await db().from("messages").select("*").eq("client_id", clientId).order("created_at"), "listClientMessages");
  },
  async findClientsByContact(contact) {
    if ("email" in contact) {
      // ilike for any case; its wildcards are escaped so an address only ever matches itself.
      const email = contact.email.trim().replace(/[\\%_]/g, (c) => `\\${c}`);
      return many<Client>(
        await db().from("clients").select("*").eq("is_demo", false).ilike("email", email).order("created_at", { ascending: false }).limit(20),
        "findClientsByContact",
      );
    }
    const target = toUsE164(contact.phone);
    if (!target) return [];
    // Phones are kept as typed, so narrow on the last four digits, then compare the whole number.
    const rows = many<Client>(
      await db()
        .from("clients")
        .select("*")
        .eq("is_demo", false)
        .like("phone", `%${target.slice(-4)}%`)
        .order("created_at", { ascending: false })
        .limit(200),
      "findClientsByContact",
    );
    return rows.filter((c) => toUsE164(c.phone) === target).slice(0, 20);
  },

  async listClinicRecords(clinicId, sandboxId) {
    if (!isUuid(sandboxId)) {
      return { clients: [], consents: [], intakes: [], scans: [], reports: [], plans: [], appointments: [], messages: [] };
    }
    const clients = await supabaseStore.listClients(clinicId, sandboxId);
    const ids = clients.map((c) => c.id);
    const forClients = (table: string, order: string) =>
      ids.length === 0 ? Promise.resolve({ data: [], error: null }) : db().from(table).select("*").in("client_id", ids).order(order);
    const [consents, intakes, scans, reports, plans, appointments, messages] = await Promise.all([
      forClients("consents", "granted_at"),
      forClients("intakes", "client_id"),
      db().from("scans").select("*").eq("sandbox_id", sandboxId).order("created_at"),
      forClients("reports", "client_id"),
      ids.length === 0
        ? Promise.resolve({ data: [], error: null })
        : db()
            .from("plans")
            .select("*, plan_items(*)")
            .in("client_id", ids)
            .order("created_at")
            .order("position", { referencedTable: "plan_items" }),
      supabaseStore.listAppointments(clinicId, sandboxId),
      supabaseStore.listMessages(clinicId, sandboxId),
    ]);
    const known = new Set(ids);
    return {
      clients,
      consents: many<Consent>(consents, "listClinicRecords consents"),
      intakes: many<Intake>(intakes, "listClinicRecords intakes"),
      scans: many<Scan>(scans, "listClinicRecords scans").filter((s) => known.has(s.clientId)),
      reports: many<Report>(reports, "listClinicRecords reports"),
      plans: (check(plans, "listClinicRecords plans") ?? []).map(({ plan_items, ...plan }): PlanWithItems => ({
        ...fromRow<ClientPlan>(plan),
        items: ((plan_items as Row[] | null) ?? []).map((i) => fromRow<PlanItem>(i)),
      })),
      appointments,
      messages,
    };
  },
  async addMessage(input) {
    const inserted = await db().from("messages").insert(toRow({ id: newId(), ...input })).select().single();
    // messages_dedupe_idx: this client already has a message with this key.
    if (inserted.error?.code === UNIQUE_VIOLATION) return null;
    return one<Message>(inserted, "addMessage");
  },
  async updateMessage(id, patch) {
    check(await db().from("messages").update(toRow(patch)).eq("id", id), "updateMessage");
  },
  async removeSkippedMessage(clientId, dedupeKey) {
    if (!isUuid(clientId)) return false;
    const rows = check(
      await db().from("messages").delete().eq("client_id", clientId).eq("dedupe_key", dedupeKey).eq("status", "skipped").select("id"),
      "removeSkippedMessage",
    );
    return (rows ?? []).length > 0;
  },
  async createPlan(plan, items) {
    const inserted = await db().from("plans").insert(toRow(plan)).select().single();
    // plans_one_live_idx: this client already has a live plan.
    if (inserted.error?.code === UNIQUE_VIOLATION) return null;
    const saved = one<ClientPlan>(inserted, "createPlan");
    const rows = await db().from("plan_items").insert(items.map((i) => toRow(i))).select();
    if (rows.error) {
      // A plan without its items would read as empty: take it back out.
      await db().from("plans").delete().eq("id", plan.id);
      throw new Error(`createPlan items: ${rows.error.message}`);
    }
    return { ...saved, items: many<PlanItem>(rows, "createPlan items").sort((a, b) => a.position - b.position) };
  },
  async confirmPlan(planId, staffId, now) {
    if (!isUuid(planId)) return null;
    // Conditional on the old status, so two tabs confirming at once can't both win.
    return maybe<ClientPlan>(
      await db()
        .from("plans")
        .update({ status: "confirmed", confirmed_by: staffId, confirmed_at: now.toISOString() })
        .eq("id", planId)
        .eq("status", "proposed")
        .select()
        .maybeSingle(),
      "confirmPlan",
    );
  },
  async setPractitionerNote(clientId, note) {
    return one<Report>(
      await db().from("reports").update({ practitioner_note: note }).eq("client_id", clientId).select().single(),
      "setPractitionerNote",
    );
  },

  async addConsent(input) {
    return one<Consent>(
      await db().from("consents").insert(toRow({ id: newId(), ...input })).select().single(),
      "addConsent",
    );
  },
  async listConsents(clientId) {
    return many<Consent>(
      await db().from("consents").select("*").eq("client_id", clientId).order("granted_at"),
      "listConsents",
    );
  },

  async getIntake(clientId) {
    if (!isUuid(clientId)) return null;
    return maybe<Intake>(await db().from("intakes").select("*").eq("client_id", clientId).maybeSingle(), "getIntake");
  },
  async saveIntake(clientId, patch, now) {
    // Create the row with column defaults if it's missing, then apply only the fields this step names.
    // Two steps saved at once can't lose each other's answers this way.
    check(
      await db()
        .from("intakes")
        .upsert({ client_id: clientId, updated_at: now.toISOString() }, { onConflict: "client_id", ignoreDuplicates: true }),
      "saveIntake",
    );
    return one<Intake>(
      await db()
        .from("intakes")
        .update(toRow({ ...patch, updatedAt: now.toISOString() }))
        .eq("client_id", clientId)
        .select()
        .single(),
      "saveIntake",
    );
  },

  async createScan(input, now) {
    const { count, error } = await db()
      .from("scans")
      .select("id", { count: "exact", head: true })
      .eq("client_id", input.clientId)
      .eq("status", "complete");
    if (error) throw new Error(`createScan: ${error.message}`);
    const scan: Scan = {
      id: newId(),
      ...input,
      scanNumber: (count ?? 0) + 1,
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
    return one<Scan>(await db().from("scans").insert(toRow(scan)).select().single(), "createScan");
  },
  async getScan(id) {
    if (!isUuid(id)) return null;
    return maybe<Scan>(await db().from("scans").select("*").eq("id", id).maybeSingle(), "getScan");
  },
  async listScans(clientId) {
    return many<Scan>(
      await db().from("scans").select("*").eq("client_id", clientId).order("created_at"),
      "listScans",
    );
  },
  async transitionScan(id, from, patch) {
    if (!isUuid(id)) return null;
    // One conditional UPDATE: Postgres lets exactly one racing request match the old status.
    return maybe<Scan>(
      await db().from("scans").update(toRow(patch)).eq("id", id).in("status", from).select().maybeSingle(),
      "transitionScan",
    );
  },
  async updateScan(id, patch) {
    return one<Scan>(await db().from("scans").update(toRow(patch)).eq("id", id).select().single(), "updateScan");
  },

  async getOrCreateReport(clientId, now) {
    const find = async () =>
      maybe<Report>(await db().from("reports").select("*").eq("client_id", clientId).maybeSingle(), "getOrCreateReport");
    const existing = await find();
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
    const inserted = await db().from("reports").insert(toRow(report)).select().single();
    // Another request created it first (one report per client): use theirs.
    if (inserted.error?.code === UNIQUE_VIOLATION) return (await find())!;
    return one<Report>(inserted, "getOrCreateReport");
  },
  async updateReportContent(reportId, content, expectedUpdatedAt) {
    const rows = check(
      await db()
        .from("reports")
        .update({ content, updated_at: new Date().toISOString() })
        .eq("id", reportId)
        .eq("updated_at", expectedUpdatedAt)
        .select("id"),
      "updateReportContent",
    );
    return (rows ?? []).length === 1;
  },
  async getReportByToken(token) {
    return maybe<Report>(await db().from("reports").select("*").eq("token", token).maybeSingle(), "getReportByToken");
  },

  async deleteClientData(clientId, now) {
    const client = await supabaseStore.getClient(clientId);
    if (!client) return { storagePaths: [] };
    const scans = many<Pick<Scan, "imagePath" | "result">>(
      await db().from("scans").select("image_path, result").eq("client_id", clientId),
      "deleteClientData scans",
    );
    // Consents, intake, scans and the report go with the client (on delete cascade).
    check(await db().from("clients").delete().eq("id", clientId), "deleteClientData");
    check(
      await db()
        .from("events")
        .insert({ clinic_id: client.clinicId, sandbox_id: client.sandboxId, type: "client_deleted", created_at: now.toISOString() }),
      "deleteClientData event",
    );
    return { storagePaths: scanStoragePaths(scans) };
  },

  async logUsage(usage) {
    check(await db().from("api_usage").insert(toRow({ id: newId(), ...usage })), "logUsage");
  },
  async settleUsage({ provider, taskId }, units) {
    check(await db().from("api_usage").update({ units }).eq("provider", provider).eq("task_id", taskId), "settleUsage");
  },
  async sumUsage({ provider, since, sandboxId, ipHash }) {
    if (sandboxId !== undefined && !isUuid(sandboxId)) return { units: 0, count: 0 };
    const rows = check(
      await db().rpc("usage_totals", {
        p_provider: provider,
        p_since: since.toISOString(),
        p_sandbox_id: sandboxId ?? null,
        p_ip_hash: ipHash ?? null,
      }),
      "sumUsage",
    ) as { units: number | string; count: number | string }[] | null;
    // bigint arrives as a number or a string depending on size.
    const totals = rows?.[0];
    return { units: Number(totals?.units ?? 0), count: Number(totals?.count ?? 0) };
  },
};

// ---------- Private photo storage ----------

const REMOVE_BATCH = 1000;

export const supabaseObjectStorage: ObjectStorage = {
  async createUploadUrl(objectPath, contentType): Promise<UploadTarget> {
    const { data, error } = await db().storage.from(SCANS_BUCKET).createSignedUploadUrl(objectPath);
    if (error || !data) throw new Error(`createUploadUrl: ${error?.message ?? "no URL"}`);
    // The token in the URL is the only credential: the browser sends the raw JPEG with its type.
    return { url: data.signedUrl, method: "PUT", headers: { "content-type": contentType } };
  },
  async put(objectPath, bytes, contentType) {
    const { error } = await db().storage.from(SCANS_BUCKET).upload(objectPath, bytes, { contentType, upsert: true });
    if (error) throw new Error(`storage put: ${error.message}`);
  },
  async get(objectPath) {
    const { data, error } = await db().storage.from(SCANS_BUCKET).download(objectPath);
    // Missing and unreadable look the same to callers: there's no photo to show or analyse.
    if (error || !data) return null;
    return { bytes: Buffer.from(await data.arrayBuffer()), contentType: data.type || "application/octet-stream" };
  },
  async remove(paths) {
    for (let i = 0; i < paths.length; i += REMOVE_BATCH) {
      const { error } = await db().storage.from(SCANS_BUCKET).remove(paths.slice(i, i + REMOVE_BATCH));
      if (error) throw new Error(`storage remove: ${error.message}`);
    }
  },
};
