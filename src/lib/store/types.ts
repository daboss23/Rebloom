import type {
  ApiUsage,
  Appointment,
  Client,
  ClientPlan,
  Clinic,
  Consent,
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

/** A plan with its items, in order. */
export type PlanWithItems = ClientPlan & { items: PlanItem[] };

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

  getSandbox(id: string): Promise<Sandbox | null>;
  createSandbox(id: string, now: Date): Promise<Sandbox>;
  /**
   * Sandboxes created before `before`, with every storage path their scans own, so the photos
   * can be removed before the rows (DECISIONS D-013: sandboxes auto-delete after 30 days).
   */
  expiredSandboxes(before: Date, limit: number): Promise<{ ids: string[]; storagePaths: string[] }>;
  /** Deletes sandboxes and everything in them, keeping api_usage so spent units stay counted. */
  deleteSandboxes(ids: string[]): Promise<void>;
  /** Time travel (DECISIONS D-016): how many days this sandbox's clock runs ahead. Never backwards. */
  setClockOffset(sandboxId: string, days: number): Promise<Sandbox>;
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
  /** One clinic's outbox in one sandbox, oldest first. */
  listMessages(clinicId: string, sandboxId: string): Promise<Message[]>;

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

  logUsage(usage: Omit<ApiUsage, "id">): Promise<void>;
  /** Corrects the units on a logged call once the provider's real charge is known. */
  settleUsage(filter: { provider: ApiUsage["provider"]; taskId: string }, units: number): Promise<void>;
  sumUsage(filter: {
    provider: ApiUsage["provider"];
    since: Date;
    sandboxId?: string;
    ipHash?: string;
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
