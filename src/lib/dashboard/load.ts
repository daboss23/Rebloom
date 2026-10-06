import "server-only";
// Everything a dashboard page reads, loaded once per request and shared by the layout and the page.

import { cache } from "react";
import { headers } from "next/headers";
import { isoDateInZone } from "@/lib/clock";
import { ensureDemoClients } from "@/lib/demo/ensure";
import { env } from "@/lib/env";
import { buildQueue, clientFacts, type ClientFacts, type EngineInput, type Queue } from "@/lib/rebook/engine";
import { sandboxNow } from "@/lib/sandbox";
import { getStore } from "@/lib/store";
import { requireSession, type DashboardSession } from "./session";

export interface Book extends DashboardSession {
  now: Date;
  /** "YYYY-MM-DD" in the clinic's time zone. */
  today: string;
  /** Days the demo clock has been moved forward. */
  offsetDays: number;
  input: EngineInput;
  facts: ClientFacts[];
  queue: Queue;
}

/** The address clients open their report on. APP_URL when set, otherwise the host this request came to. */
export async function appOrigin(): Promise<string> {
  if (env.APP_URL) return env.APP_URL.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export const loadBook = cache(async (): Promise<Book> => {
  const session = await requireSession();
  const { clinic, sandboxId, staff } = session;
  const store = getStore();
  const now = await sandboxNow();
  // First visit from this browser: give it its own copy of the demo clients (DECISIONS D-014).
  await ensureDemoClients(clinic, sandboxId, now);
  const [records, treatments, products, sandbox, origin] = await Promise.all([
    store.listClinicRecords(clinic.id, sandboxId),
    store.listTreatments(clinic.id),
    store.listProducts(clinic.id),
    store.getSandbox(sandboxId),
    appOrigin(),
  ]);
  const input: EngineInput = {
    clinic,
    practitionerName: staff.name,
    now,
    reportUrl: (token) => `${origin}/r/${token}`,
    treatments,
    products,
    ...records,
  };
  return {
    ...session,
    now,
    today: isoDateInZone(now, clinic.timezone),
    offsetDays: sandbox?.clockOffsetDays ?? 0,
    input,
    facts: clientFacts(input),
    queue: buildQueue(input),
  };
});
