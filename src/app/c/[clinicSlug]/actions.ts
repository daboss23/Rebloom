"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { CONSENT_VERSION } from "@/lib/flow/consent";
import { INTAKE_STEPS, stepSchemas, type IntakeStep } from "@/lib/flow/intake-schema";
import { hasBiometricConsent, loadFlow } from "@/lib/flow/load";
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
  if (form.get("reminders") === "on" && !state.consents.some((c) => c.type === "reminders")) {
    await store.addConsent({ ...record, type: "reminders" });
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
    await store.updateClient(state.client.id, {
      firstName: about.firstName,
      email: about.email,
      phone: about.phone,
      ageRange: about.ageRange,
    });
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
