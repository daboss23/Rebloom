// Core domain types shared by every store implementation.
// Field names are camelCase here; the Supabase store maps them to snake_case columns.

import type { ConcernKey } from "@/lib/skin/concerns";
import type { FitzpatrickReading } from "@/lib/skin/fitzpatrick";

export type ISODate = string; // "2026-10-05"
export type ISODateTime = string; // full ISO timestamp

export interface OpeningHours {
  /** 0 = Sunday … 6 = Saturday. Missing days are closed. */
  days: Partial<Record<0 | 1 | 2 | 3 | 4 | 5 | 6, { open: string; close: string }>>;
  slotMinutes: number;
}

export interface Clinic {
  id: string;
  slug: string;
  name: string;
  /** Text shown in the wordmark, e.g. "MAISON VERRE". */
  wordmark: string;
  wordmarkStyle: "serif" | "sans";
  /** Optional small mark shown next to the wordmark. */
  monogramUrl?: string;
  lockupUrl?: string;
  accentHex: string;
  city: string;
  address: string;
  phone: string;
  timezone: string;
  hours: OpeningHours;
  depositCents: number;
}

/** What the clinic owner switches on or off in Settings (DECISIONS D-066). Per sandbox in the demo. */
export interface ClinicSettings {
  /** Booking takes the clinic's deposit (depositCents) through Stripe. Off: a time is booked with no payment. */
  depositRequired: boolean;
  /** Where a client's reply is announced as it lands (DECISIONS D-087). Null: no alert by email. */
  alertEmail: string | null;
  /** A US mobile for the same alert by text, "+13105550100". Null: none. */
  alertPhone: string | null;
}

export const DEFAULT_CLINIC_SETTINGS: ClinicSettings = { depositRequired: true, alertEmail: null, alertPhone: null };

export interface Treatment {
  id: string;
  clinicId: string;
  name: string;
  description: string;
  priceCents: number;
  /** Null means an ongoing treatment (e.g. a monthly facial). */
  sessionsTypical: number | null;
  intervalDaysMin: number;
  intervalDaysMax: number;
  maintenanceIntervalDays: number | null;
  durationMinutes: number;
  /** Visible downtime after a session, in days. */
  downtimeDays: number;
  /** Never schedule within this many days before a client's event. */
  minDaysBeforeEvent: number;
  concerns: ConcernKey[];
  screeningFlags: ScreeningKey[];
  /** The highest Fitzpatrick type (1 to 6) the clinic offers this to, e.g. 3 for IPL. Null or absent: every type (D-094). */
  fitzpatrickMax?: number | null;
  active: boolean;
}

export interface Product {
  id: string;
  clinicId: string;
  name: string;
  description: string;
  priceCents: number;
  concerns: ConcernKey[];
  active: boolean;
}

export type ClientStatus =
  | "started" // in the scan flow, no scan yet
  | "lead" // has a report, no booking
  | "booked"
  | "in_course"
  | "course_complete"
  | "at_risk"
  | "lapsed";

export interface Client {
  id: string;
  clinicId: string;
  /** Per-browser sandbox (DECISIONS D-013). Null for shared seed templates. */
  sandboxId: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  ageRange: AgeRange | null;
  status: ClientStatus;
  isDemo: boolean;
  /** Which demo client this row was copied from ("amelia"). Null for real clients (DECISIONS D-049). */
  demoKey: string | null;
  /** Fitzpatrick skin type: YouCam's estimate from the first live scan, or the clinic's own call (D-094). */
  fitzpatrick?: FitzpatrickReading | null;
  createdAt: ISODateTime;
}

export type ConsentType = "biometric" | "reminders" | "texts";

export interface Consent {
  id: string;
  clientId: string;
  type: ConsentType;
  grantedAt: ISODateTime;
  textVersion: string;
  ipHash: string | null;
  userAgent: string | null;
}

export type IntakeConcern =
  | "uneven_tone"
  | "texture"
  | "pores"
  | "fine_lines"
  | "redness"
  | "breakouts"
  | "dullness"
  | "firmness"
  | "other";

export type PastTreatment =
  | "none"
  | "facials"
  | "peels"
  | "microneedling"
  | "laser_ipl"
  | "injectables"
  | "other";

export type BudgetBand = "under_500" | "500_1000" | "1000_2000" | "2000_plus";
export type EventType = "wedding" | "holiday" | "reunion" | "other";
export type AgeRange = "under_25" | "25_34" | "35_44" | "45_54" | "55_64" | "65_plus";

export type ScreeningKey =
  | "retinoid"
  | "sun_exposure"
  | "pregnant_breastfeeding"
  | "isotretinoin"
  | "cold_sores"
  | "sensitivities";

export type ScreeningAnswer = "yes" | "no" | "unsure";

/**
 * What Claude read in the client's own words (DECISIONS D-079): the concerns they meant, each with a short
 * phrase to say back to them. Only trusted while `text` still matches what they wrote.
 */
export interface GoalReading {
  text: string;
  concerns: { key: ConcernKey; phrase: string }[];
  readAt: ISODateTime;
}

export interface Intake {
  clientId: string;
  concerns: IntakeConcern[];
  concernsOther: string | null;
  goalText: string | null;
  hasEvent: boolean | null;
  eventType: EventType | null;
  eventDate: ISODate | null;
  pastTreatments: PastTreatment[];
  budgetBand: BudgetBand | null;
  screening: Partial<Record<ScreeningKey, ScreeningAnswer>>;
  sensitivitiesNote: string | null;
  /** Absent until Claude has read their words, and on scans from before D-079. */
  goalReading?: GoalReading | null;
  completedAt: ISODateTime | null;
  updatedAt: ISODateTime;
}

export type ScanStatus = "uploading" | "uploaded" | "analyzing" | "finalizing" | "complete" | "failed";
export type ScanSource = "live" | "fixture";

export interface CaptureQuality {
  method: "camera" | "upload";
  faceWidthRatio: number;
  centerOffset: number;
  yaw: number;
  pitch: number;
  roll: number;
  luminance: number;
  clippedShare: number;
  evenness: number;
  warmth: number;
  sharpness: number;
  eyesOpen: number;
  passedGate: boolean;
}

export interface ConcernScore {
  key: ConcernKey;
  ui: number;
  raw: number;
  /** Storage path of the mask PNG, if any. */
  maskPath: string | null;
  /** HD only: ui scores by facial area, e.g. { forehead: 81, crowfeet: 64 } for wrinkles. */
  areas?: Record<string, number>;
}

export interface ScanResult {
  concerns: ConcernScore[];
  overall: { ui: number; raw: number } | null;
  skinAge: number | null;
  skinType: string | null;
  /** Which YouCam model read the photo. Absent on older scans, which were all SD. */
  engine?: "sd" | "hd";
}

export interface Scan {
  id: string;
  clientId: string;
  sandboxId: string | null;
  scanNumber: number;
  status: ScanStatus;
  source: ScanSource;
  imagePath: string;
  imageWidth: number;
  imageHeight: number;
  captureQuality: CaptureQuality | null;
  /** Normalised [x, y] face landmarks in image space, rounded. */
  landmarks: [number, number][] | null;
  concernsRequested: ConcernKey[];
  providerTaskId: string | null;
  /** YouCam's Fitzpatrick task, started beside the analysis on a client's first live scan (D-094). */
  fitzpatrickTaskId?: string | null;
  analysisStartedAt: ISODateTime | null;
  errorCode: string | null;
  youcamRaw: unknown;
  result: ScanResult | null;
  /** Comparison confidence against scan 01 (rescans only). */
  comparisonConfidence: "high" | "lower" | null;
  createdAt: ISODateTime;
  completedAt: ISODateTime | null;
}

export interface Report {
  id: string;
  clientId: string;
  token: string;
  content: unknown;
  practitionerNote: string | null;
  version: number;
  updatedAt: ISODateTime;
}

export interface ApiUsage {
  id: string;
  provider: "youcam" | "anthropic";
  feature: string;
  units: number;
  taskId: string | null;
  sandboxId: string | null;
  ipHash: string | null;
  createdAt: ISODateTime;
}

export interface Sandbox {
  id: string;
  createdAt: ISODateTime;
  /** Days the demo clock has been moved forward (time travel). */
  clockOffsetDays: number;
  /** Minutes beyond those days, 0 to 1439, from a jump to the next opening (D-091). Missing before that migration. */
  clockOffsetMinutes?: number;
}

// ---------- The clinic side (Week 3) ----------

export interface Staff {
  id: string;
  clinicId: string;
  /** Supabase Auth user, once dashboard login exists. */
  userId: string | null;
  name: string;
  /** "Lead Aesthetician" */
  title: string;
  role: "owner" | "practitioner";
  createdAt: ISODateTime;
}

export type PlanStatus = "proposed" | "confirmed" | "completed" | "cancelled";

/**
 * A plan a practitioner proposed or confirmed, with prices fixed at that moment. The report's suggested
 * plan is computed (src/lib/plan/build.ts) and never stored; this is what the clinic agreed with the client.
 */
export interface ClientPlan {
  id: string;
  clientId: string;
  /** The scan it was built from. */
  scanId: string | null;
  status: PlanStatus;
  confirmedBy: string | null;
  confirmedAt: ISODateTime | null;
  /** Every item, home care included, computed in code. */
  totalCents: number;
  createdAt: ISODateTime;
}

export interface PlanItem {
  id: string;
  planId: string;
  /** Exactly one of treatmentId and productId is set. */
  treatmentId: string | null;
  productId: string | null;
  /** Sessions for a treatment, units for a product. */
  quantity: number;
  unitPriceCents: number;
  position: number;
  /** When the first session is planned. Null for products. */
  targetDate: ISODate | null;
}

export type AppointmentKind = "consult" | "treatment";
export type AppointmentStatus = "booked" | "completed" | "cancelled" | "no_show";
export type DepositStatus = "none" | "pending" | "paid" | "refunded";

export interface Appointment {
  id: string;
  clinicId: string;
  clientId: string;
  sandboxId: string | null;
  kind: AppointmentKind;
  /** Set for treatments, null for a consult. */
  treatmentId: string | null;
  planItemId: string | null;
  staffId: string | null;
  startsAt: ISODateTime;
  endsAt: ISODateTime;
  status: AppointmentStatus;
  depositCents: number;
  depositStatus: DepositStatus;
  depositPaymentIntent: string | null;
  createdAt: ISODateTime;
}

// ---------- The agent (DECISIONS D-093) ----------

/** What the agent was asked for: an answer to a client's reply, or a second look at a stalled plan. */
export type AgentDraftKind = "answer" | "plan_review";

/**
 * working: the agent is on it. ready: waiting for Dana. failed: it couldn't, so Dana writes it herself.
 * used: Dana sent it, as written or changed. dismissed: Dana set it aside.
 */
export type AgentDraftStatus = "working" | "ready" | "failed" | "used" | "dismissed";

/** One thing the agent did, said plainly for Dana: "Found Saturday at 10am open". */
export interface AgentStep {
  text: string;
  at: ISODateTime;
}

/** What the agent made of a stalled plan (D-093 parts 2 and 3). Prices and dates are worked out in code. */
export interface PlanSuggestion {
  /** Whether the last scans can be compared at all: light, the photo checks, the same engine. */
  measurement: { trustworthy: boolean; reasons: string[] };
  /** Null when the agent asks for a rescan instead of a change. */
  change: {
    treatmentId: string;
    treatmentName: string;
    sessions: number;
    priceCents: number;
    /** The plan's treatment it would take over from, if any. */
    replacesTreatmentId: string | null;
    replacesName: string | null;
    /** The stalled concerns it works on. */
    covers: ConcernKey[];
    /** Screening answers Dana should look at first. Prompts, never decisions. */
    flags: string[];
    why: string;
  } | null;
}

/**
 * A draft the agent wrote for Dana (D-093). Nothing in it reaches a client: Dana reads it, changes what she likes,
 * and sends it herself. What she sent is kept beside what the agent wrote, so the next draft sounds more like her.
 */
export interface AgentDraft {
  id: string;
  clinicId: string;
  clientId: string;
  sandboxId: string | null;
  kind: AgentDraftKind;
  /** The reply it answers (its message id), or the queue item it reviews (its dedupe key). One draft each. */
  forKey: string;
  status: AgentDraftStatus;
  channel: Message["channel"] | null;
  subject: string | null;
  body: string | null;
  /** One line for Dana: what to check before sending. */
  note: string | null;
  steps: AgentStep[];
  suggestion: PlanSuggestion | null;
  /** Times the agent checked were open and may have named, so the brief can say if one has gone since. */
  offeredTimes: string[];
  model: string | null;
  tokens: number;
  /** What Dana actually sent, once she has. */
  sentBody: string | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

/** "received" is a reply from the client (DECISIONS D-081); every other status is something the clinic sent. */
export type MessageStatus = "draft" | "queued" | "sent" | "failed" | "skipped" | "received";

/** The outbox. Demo emails go to a visible log, never a real inbox (brief section 5). */
export interface Message {
  id: string;
  clinicId: string;
  clientId: string;
  sandboxId: string | null;
  /**
   * "report_link", "booking_confirmation", a rebook trigger such as "next_session_due", or, for a client's
   * conversation (D-081): "reply" from them, "answer" from the clinic, "reply_handled" when no answer was needed.
   */
  type: string;
  channel: "email" | "sms";
  subject: string | null;
  body: string;
  status: MessageStatus;
  /** The rebook engine's idempotency key: it never queues the same message twice. */
  dedupeKey: string | null;
  scheduledFor: ISODateTime | null;
  sentAt: ISODateTime | null;
  createdAt: ISODateTime;
  /**
   * A reply only: the address or number it came from. Left out of everything the clinic sends, so sending never
   * depends on the replies migration.
   */
  sender?: string | null;
}
