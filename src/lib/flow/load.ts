import "server-only";
import { notFound, redirect } from "next/navigation";
import type { Client, Clinic, Consent, Intake } from "@/lib/domain";
import { readSandboxId, readVisitClientId } from "@/lib/sandbox";
import { getStore } from "@/lib/store";

export interface FlowState {
  clinic: Clinic;
  client: Client | null;
  consents: Consent[];
  intake: Intake | null;
}

export async function loadClinic(slug: string): Promise<Clinic> {
  const clinic = await getStore().getClinicBySlug(slug);
  if (!clinic) notFound();
  return clinic;
}

/** Loads where this browser is in the scan flow for one clinic. */
export async function loadFlow(slug: string): Promise<FlowState> {
  const store = getStore();
  const clinic = await loadClinic(slug);
  const [clientId, sandboxId] = await Promise.all([readVisitClientId(slug), readSandboxId()]);
  let client = clientId ? await store.getClient(clientId) : null;
  // A visit cookie only counts inside the sandbox that created it.
  if (client && (client.clinicId !== clinic.id || client.sandboxId !== sandboxId)) client = null;
  const [consents, intake] = client
    ? await Promise.all([store.listConsents(client.id), store.getIntake(client.id)])
    : [[], null];
  return { clinic, client, consents, intake };
}

export function hasBiometricConsent(state: FlowState): boolean {
  return state.consents.some((c) => c.type === "biometric");
}

/** Sends people back to the right step if they skip ahead. */
export function requireStep(state: FlowState, step: "intake" | "capture"): asserts state is FlowState & { client: Client } {
  const base = `/c/${state.clinic.slug}`;
  if (!state.client || !hasBiometricConsent(state)) redirect(`${base}/consent`);
  if (step === "capture" && !state.intake?.completedAt) redirect(`${base}/intake`);
}
