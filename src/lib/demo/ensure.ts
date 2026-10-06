import "server-only";
import type { Clinic } from "@/lib/domain";
import { isoDateInZone } from "@/lib/clock";
import { getStore } from "@/lib/store";
import { buildDemoBundle } from "./seed";

/**
 * Gives a sandbox its own copy of the clinic's demo clients the first time it needs them (DECISIONS D-014),
 * laid out around the sandbox's "today". Safe to call on every dashboard request: after the first copy
 * it's one read. True when this call made the copy.
 */
export async function ensureDemoClients(clinic: Clinic, sandboxId: string, now: Date): Promise<boolean> {
  const store = getStore();
  const clients = await store.listClients(clinic.id, sandboxId);
  if (clients.some((c) => c.demoKey)) return false;
  const [treatments, products, staff] = await Promise.all([
    store.listTreatments(clinic.id),
    store.listProducts(clinic.id),
    store.listStaff(clinic.id),
  ]);
  const bundle = buildDemoBundle({ clinic, treatments, products, staff, sandboxId, today: isoDateInZone(now, clinic.timezone) });
  return store.seedDemoClients(clinic.id, sandboxId, bundle);
}
