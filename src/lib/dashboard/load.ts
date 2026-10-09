import "server-only";
// Everything a dashboard page reads, loaded once per request and shared by the layout and the page.

import { cache } from "react";
import { isoDateInZone } from "@/lib/clock";
import { ensureDemoClients } from "@/lib/demo/ensure";
import { syncEmailReplies } from "@/lib/replies/email";
import { buildQueue, clientFacts, type ClientFacts, type EngineInput, type Queue } from "@/lib/rebook/engine";
import { sandboxNow } from "@/lib/sandbox";
import { appOrigin } from "@/lib/origin";
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

export const loadBook = cache(async (): Promise<Book> => {
  const session = await requireSession();
  const { clinic, sandboxId, staff } = session;
  const store = getStore();
  const now = await sandboxNow();
  // First visit from this browser: give it its own copy of the demo clients (DECISIONS D-014). Meanwhile, any reply
  // Resend received that its webhook didn't bring (D-084), given three seconds at most.
  await Promise.all([ensureDemoClients(clinic, sandboxId, now), Promise.race([syncEmailReplies(), new Promise((r) => setTimeout(r, 3000))])]);
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
    // A time held while a client pays isn't a visit yet (DECISIONS D-065).
    appointments: records.appointments.filter((a) => !(a.status === "booked" && a.depositStatus === "pending")),
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
