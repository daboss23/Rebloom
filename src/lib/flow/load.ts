import "server-only";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import type { Client, Clinic, Consent, Intake } from "@/lib/domain";
import { readSandboxId, readVisitClientId } from "@/lib/sandbox";
import { getStore } from "@/lib/store";

export interface FlowState {
  clinic: Clinic;
  client: Client | null;
  consents: Consent[];
  intake: Intake | null;
  /**
   * This browser's visit already ended in a finished scan. Starting the flow again begins a new visit rather than
   * reopening that one (its report link is where that client goes back to, and rescans live there).
   */
  finished: boolean;
}

/** One lookup per request, however many layouts and pages ask (it's a database query with Supabase). */
export const loadClinic = cache(async (slug: string): Promise<Clinic> => {
  const clinic = await getStore().getClinicBySlug(slug);
  if (!clinic) notFound();
  return clinic;
});

/** Loads where this browser is in the scan flow for one clinic. */
export async function loadFlow(slug: string): Promise<FlowState> {
  const store = getStore();
  const clinic = await loadClinic(slug);
  const [clientId, sandboxId] = await Promise.all([readVisitClientId(slug), readSandboxId()]);
  let client = clientId ? await store.getClient(clientId) : null;
  // A visit cookie only counts inside the sandbox that created it.
  if (client && (client.clinicId !== clinic.id || client.sandboxId !== sandboxId)) client = null;
  const [consents, intake, scans] = client
    ? await Promise.all([store.listConsents(client.id), store.getIntake(client.id), store.listScans(client.id)])
    : [[], null, []];
  return { clinic, client, consents, intake, finished: scans.some((s) => s.status === "complete") };
}

/** A visit that has started (consent given) and isn't finished: the start page offers to pick it up. */
export function inProgress(state: FlowState): boolean {
  return Boolean(state.client) && !state.finished && hasBiometricConsent(state);
}

export function hasBiometricConsent(state: FlowState): boolean {
  return state.consents.some((c) => c.type === "biometric");
}

/** Sends people back to the right step if they skip ahead. */
export function requireStep(state: FlowState, step: "intake" | "capture"): asserts state is FlowState & { client: Client } {
  const base = `/c/${state.clinic.slug}`;
  // A finished visit can't be reopened from here: consent starts a new one.
  if (!state.client || state.finished || !hasBiometricConsent(state)) redirect(`${base}/consent`);
  if (step === "capture" && !state.intake?.completedAt) redirect(`${base}/intake`);
}
