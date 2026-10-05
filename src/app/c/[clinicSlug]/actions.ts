"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { CONSENT_VERSION } from "@/lib/flow/consent";
import { INTAKE_STEPS, stepSchemas, unlockSchema, type IntakeStep } from "@/lib/flow/intake-schema";
import { getOwnScan } from "@/lib/scans/access";
import { hasBiometricConsent, loadFlow } from "@/lib/flow/load";
import { REPORT_EMAIL_LIVE } from "@/lib/report/load";
import {
  ensureSandboxId,
  requestIpHash,
  requestUserAgent,
  sandboxNow,
  setVisitClientId,
} from "@/lib/sandbox";
import { getStore } from "@/lib/store";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

/** What the confirmation after the report gate shows. */
export interface SentResults {
  firstName: string;
  email: string;
  reportPath: string;
  /** False until the report email is live: the page must not claim it was sent. */
  emailed: boolean;
}

export interface UnlockResult extends ActionResult {
  sent?: SentResults;
}

/** Records consent, creating the client for this browser if needed. */
export async function giveConsent(slug: string, _prev: ActionResult | null, form: FormData): Promise<ActionResult> {
  if (form.get("biometric") !== "on") {
    return { ok: false, error: "Please confirm you agree to the photo analysis to continue." };
  }
  const store = getStore();
  const sandboxId = await ensureSandboxId();
  const state = await loadFlow(slug);
  const now = await sandboxNow();

  let client = state.client;
  if (!client) {
    client = await store.createClient({ clinicId: state.clinic.id, sandboxId, now });
    await setVisitClientId(slug, client.id);
  }

  const [ipHash, userAgent] = await Promise.all([requestIpHash(), requestUserAgent()]);
  const record = { clientId: client.id, grantedAt: new Date().toISOString(), textVersion: CONSENT_VERSION, ipHash, userAgent };
  if (!state.consents.some((c) => c.type === "biometric")) {
    await store.addConsent({ ...record, type: "biometric" });
  }
  redirect(`/c/${slug}/intake`);
}

const stepInput = z.object({ step: z.enum(INTAKE_STEPS), data: z.unknown() });

/** Saves one intake screen. Called as you go, so a refresh never loses answers. */
export async function saveIntakeStep(slug: string, input: { step: IntakeStep; data: unknown }): Promise<ActionResult> {
  const parsedInput = stepInput.safeParse(input);
  if (!parsedInput.success) return { ok: false, error: "Something went wrong. Please try again." };
  const { step, data } = parsedInput.data;

  const state = await loadFlow(slug);
  if (!state.client || !hasBiometricConsent(state)) return { ok: false, error: "Your session expired. Please start again." };

  const parsed = stepSchemas[step].safeParse(data);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check your answer." };

  const store = getStore();
  const now = await sandboxNow();
  if (step === "about") {
    const about = stepSchemas.about.parse(data);
    await store.updateClient(state.client.id, { ageRange: about.ageRange });
    await store.saveIntake(state.client.id, { completedAt: now.toISOString() }, now);
  } else if (step === "event") {
    const event = stepSchemas.event.parse(data);
    if (event.hasEvent && event.eventDate && event.eventDate <= now.toISOString().slice(0, 10)) {
      return { ok: false, error: "Please choose a date in the future." };
    }
    await store.saveIntake(
      state.client.id,
      event.hasEvent ? event : { hasEvent: false, eventType: null, eventDate: null },
      now,
    );
  } else {
    await store.saveIntake(state.client.id, parsed.data as Record<string, unknown>, now);
  }
  return { ok: true };
}

/**
 * The report gate. Contact details unlock the report the client just scanned for (brief 3.1 step 6).
 * Until this runs, the browser never receives the report link or the real scores.
 * The client stays on the page and sees a "results sent" confirmation, not the report itself.
 */
export async function unlockReport(
  slug: string,
  scanId: string,
  _prev: UnlockResult | null,
  form: FormData,
): Promise<UnlockResult> {
  const parsed = unlockSchema.safeParse({
    firstName: form.get("firstName") ?? "",
    email: form.get("email") ?? "",
    phone: form.get("phone") ?? "",
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check your details." };

  const state = await loadFlow(slug);
  const scan = await getOwnScan(scanId);
  if (!state.client || !scan || scan.clientId !== state.client.id || scan.status !== "complete") {
    return { ok: false, error: "Your session expired. Please start again." };
  }

  const store = getStore();
  const now = await sandboxNow();
  const client = state.client;
  await store.updateClient(client.id, {
    ...parsed.data,
    status: client.status === "started" ? "lead" : client.status,
  });
  if (form.get("reminders") === "on" && !state.consents.some((c) => c.type === "reminders")) {
    const [ipHash, userAgent] = await Promise.all([requestIpHash(), requestUserAgent()]);
    await store.addConsent({
      clientId: client.id,
      type: "reminders",
      grantedAt: new Date().toISOString(),
      textVersion: CONSENT_VERSION,
      ipHash,
      userAgent,
    });
  }
  const report = await store.getOrCreateReport(client.id, now);
  return {
    ok: true,
    sent: {
      firstName: parsed.data.firstName,
      email: parsed.data.email,
      reportPath: `/r/${report.token}`,
      emailed: REPORT_EMAIL_LIVE,
    },
  };
}
