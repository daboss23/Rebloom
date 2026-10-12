import type {
  AgentDraft,
  AgentDraftStatus,
  ApiUsage,
  Appointment,
  AppointmentStatus,
  Client,
  ClientPlan,
  Clinic,
  ClinicSettings,
  Consent,
  DepositStatus,
  Intake,
  Message,
  PlanItem,
  Product,
  Report,
  Sandbox,
  Scan,
  ScanStatus,
  Staff,
  Treatment,
} from "@/lib/domain";
import type { DemoBundle } from "@/lib/demo/seed";

/** Another booked visit already has that time: one treatment room per clinic (DECISIONS D-049). */
export class SlotTakenError extends Error {
  constructor() {
    super("That time has just been booked.");
    this.name = "SlotTakenError";
  }
}

/** What a conditional appointment change expects to find. */
export interface AppointmentMatch {
  status: AppointmentStatus[];
  depositStatus?: DepositStatus[];
}

/** The fields a booking may change after it's made. */
export type AppointmentPatch = Partial<Pick<Appointment, "status" | "depositStatus" | "depositPaymentIntent" | "planItemId">>;

/** A plan with its items, in order. */
export type PlanWithItems = ClientPlan & { items: PlanItem[] };

/** Everything the dashboard reads about one clinic's clients in one sandbox, fetched in one round. */
export interface ClinicRecords {
  clients: Client[];
  consents: Consent[];
  intakes: Intake[];
  scans: Scan[];
  reports: Report[];
  plans: PlanWithItems[];
  appointments: Appointment[];
  messages: Message[];
}

export type NewScan = Pick<
  Scan,
  "clientId" | "sandboxId" | "imagePath" | "imageWidth" | "imageHeight" | "captureQuality" | "landmarks" | "concernsRequested"
>;

/**
 * Everything the app reads or writes. Pages and routes only ever talk to this interface,
 * never to a specific database (DECISIONS D-017).
 */
export interface Store {
  readonly kind: "local" | "supabase";

  listClinics(): Promise<Clinic[]>;
  getClinicBySlug(slug: string): Promise<Clinic | null>;
  getClinic(id: string): Promise<Clinic | null>;
  listTreatments(clinicId: string): Promise<Treatment[]>;
  listProducts(clinicId: string): Promise<Product[]>;
  listStaff(clinicId: string): Promise<Staff[]>;
  /** The owner's settings for a clinic in one sandbox, or the defaults when none are saved. */
  getClinicSettings(clinicId: string, sandboxId: string | null): Promise<ClinicSettings>;
  setClinicSettings(clinicId: string, sandboxId: string | null, patch: Partial<ClinicSettings>, now: Date): Promise<ClinicSettings>;

  getSandbox(id: string): Promise<Sandbox | null>;
  createSandbox(id: string, now: Date): Promise<Sandbox>;
  /**
   * Sandboxes created before `before`, with every storage path their scans own, so the photos
   * can be removed before the rows (DECISIONS D-013: sandboxes auto-delete after 30 days).
   */
  expiredSandboxes(before: Date, limit: number): Promise<{ ids: string[]; storagePaths: string[] }>;
  /** Deletes sandboxes and everything in them, keeping api_usage so spent units stay counted. */
  deleteSandboxes(ids: string[]): Promise<void>;
  /**
   * Time travel (DECISIONS D-016): how far this sandbox's clock runs ahead, in days and, after a jump to the next
   * opening (D-091), minutes. Never backwards. Without `minutes`, the minutes already set stay as they are.
   */
  setClockOffset(sandboxId: string, days: number, minutes?: number): Promise<Sandbox>;
  /**
   * Copies the demo clients into a sandbox, all or nothing (DECISIONS D-014). False when this sandbox
   * already has its copy for the clinic, including when a racing request has just made it.
   */
  seedDemoClients(clinicId: string, sandboxId: string, bundle: DemoBundle): Promise<boolean>;

  createClient(input: { clinicId: string; sandboxId: string | null; now: Date }): Promise<Client>;
  getClient(id: string): Promise<Client | null>;
  updateClient(id: string, patch: Partial<Omit<Client, "id">>): Promise<Client>;
  /** One clinic's clients in one sandbox, newest first. Nobody sees another sandbox's clients (D-013). */
  listClients(clinicId: string, sandboxId: string): Promise<Client[]>;

  /** A client's plans, oldest first. */
  listPlans(clientId: string): Promise<PlanWithItems[]>;
  /** One clinic's appointments in one sandbox, in time order. */
  listAppointments(clinicId: string, sandboxId: string): Promise<Appointment[]>;
  getAppointment(id: string): Promise<Appointment | null>;
  /** Books a visit. Throws SlotTakenError when a booked visit in the same sandbox overlaps it. */
  addAppointment(appointment: Appointment): Promise<Appointment>;
  /**
   * Changes a visit only while it still matches `from`, so a deposit confirmed twice, or a hold released while it's
   * being paid, settles exactly once. Null when it no longer matches. Throws SlotTakenError when bringing a visit
   * back would overlap one booked since.
   */
  transitionAppointment(id: string, from: AppointmentMatch, patch: AppointmentPatch): Promise<Appointment | null>;
  /** One clinic's outbox in one sandbox, oldest first. */
  listMessages(clinicId: string, sandboxId: string): Promise<Message[]>;
  /** One client's messages and replies, oldest first (DECISIONS D-081). */
  listClientMessages(clientId: string): Promise<Message[]>;
  /**
   * Real clients (never the demo's samples) with this email address, any case, or this US mobile number however it
   * was typed. How a reply that didn't come to a client's own reply address finds them (D-081). Newest first.
   */
  findClientsByContact(contact: { email: string } | { phone: string }): Promise<Client[]>;
  /**
   * Every row the dashboard needs for one clinic in one sandbox. One round of reads instead of
   * several per client, so the dashboard stays quick however many clients a sandbox gathers.
   */
  listClinicRecords(clinicId: string, sandboxId: string): Promise<ClinicRecords>;
  /** Adds to the outbox. Null when this client already has a message with the same dedupe key. */
  addMessage(message: Omit<Message, "id">): Promise<Message | null>;
  /** Records what happened to a message after it was queued: sent, or failed. */
  updateMessage(id: string, patch: Partial<Pick<Message, "status" | "sentAt">>): Promise<void>;
  /** Takes back a "marked done" line (status skipped) from the outbox. Sent messages can never be removed. */
  removeSkippedMessage(clientId: string, dedupeKey: string): Promise<boolean>;
  /** Saves a plan with its items. Null when the client already has a live plan (one per client). */
  createPlan(plan: ClientPlan, items: PlanItem[]): Promise<PlanWithItems | null>;
  /** Confirms a proposed plan. Null when it isn't proposed any more (another tab confirmed it first). */
  confirmPlan(planId: string, staffId: string | null, now: Date): Promise<ClientPlan | null>;
  /** The practitioner's note, shown on the client's report. Empty clears it. */
  setPractitionerNote(clientId: string, note: string | null): Promise<Report>;

  addConsent(consent: Omit<Consent, "id">): Promise<Consent>;
  listConsents(clientId: string): Promise<Consent[]>;

  getIntake(clientId: string): Promise<Intake | null>;
  saveIntake(clientId: string, patch: Partial<Omit<Intake, "clientId">>, now: Date): Promise<Intake>;

  createScan(input: NewScan, now: Date): Promise<Scan>;
  getScan(id: string): Promise<Scan | null>;
  listScans(clientId: string): Promise<Scan[]>;
  /**
   * Moves a scan to a new status only if it is currently in one of `from`.
   * Returns null when another request got there first. This is what makes finalisation run once.
   */
  transitionScan(id: string, from: ScanStatus[], patch: Partial<Omit<Scan, "id">> & { status: ScanStatus }): Promise<Scan | null>;
  updateScan(id: string, patch: Partial<Omit<Scan, "id">>): Promise<Scan>;

  getOrCreateReport(clientId: string, now: Date): Promise<Report>;
  /**
   * Replaces the report's generated content (simulation state today, the Claude-written report later),
   * only if nobody has written since `expectedUpdatedAt`. False when someone has: re-read and decide again.
   */
  updateReportContent(reportId: string, content: unknown, expectedUpdatedAt: string): Promise<boolean>;
  getReportByToken(token: string): Promise<Report | null>;

  /**
   * Deletes a client's personal data and returns the storage paths to remove.
   * Keeps only an anonymous event so counts stay right (brief section 5).
   */
  deleteClientData(clientId: string, now: Date): Promise<{ storagePaths: string[] }>;

  /** The agent's drafts for one clinic in one sandbox, oldest first (D-093). */
  listAgentDrafts(clinicId: string, sandboxId: string): Promise<AgentDraft[]>;
  getAgentDraft(id: string): Promise<AgentDraft | null>;
  /** Starts a draft. Null when this client already has one for the same reply or queue item. */
  startAgentDraft(draft: Omit<AgentDraft, "id">): Promise<AgentDraft | null>;
  /**
   * Changes a draft only while its status is one of `from`, so two requests can't both pick up the same draft, and a
   * draft Dana has used can't be overwritten by a run that finishes late. Null when it no longer matches.
   */
  updateAgentDraft(id: string, from: AgentDraftStatus[], patch: Partial<Omit<AgentDraft, "id" | "clientId" | "forKey">>): Promise<AgentDraft | null>;

  logUsage(usage: Omit<ApiUsage, "id">): Promise<void>;
  /** Corrects the units on a logged call once the provider's real charge is known. */
  settleUsage(filter: { provider: ApiUsage["provider"]; taskId: string }, units: number): Promise<void>;
  sumUsage(filter: {
    provider: ApiUsage["provider"];
    since: Date;
    sandboxId?: string;
    ipHash?: string;
    /** Only calls for these features, so one feature's safety valve isn't spent by another's. */
    features?: string[];
  }): Promise<{ units: number; count: number }>;
}

export interface UploadTarget {
  url: string;
  method: "PUT";
  headers: Record<string, string>;
}

/** Private object storage for face images and masks. Never public. */
export interface ObjectStorage {
  createUploadUrl(path: string, contentType: string): Promise<UploadTarget>;
  put(path: string, bytes: Buffer, contentType: string): Promise<void>;
  get(path: string): Promise<{ bytes: Buffer; contentType: string } | null>;
  remove(paths: string[]): Promise<void>;
}
