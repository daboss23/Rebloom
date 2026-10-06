"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { DANA } from "@/data/staff";
import { checkCopy } from "@/lib/copy/check";
import { loadBook } from "@/lib/dashboard/load";
import { clearStaffCookie, readSession, setStaffCookie } from "@/lib/dashboard/session";
import { ensureDemoClients } from "@/lib/demo/ensure";
import { env, features } from "@/lib/env";
import { resend } from "@/lib/email/resend";
import { ensureSandboxId, sandboxNow } from "@/lib/sandbox";
import { getStore } from "@/lib/store";
import type { PlanItem } from "@/lib/domain";
import { newId } from "@/lib/ids";
import { suggestedPlan } from "@/lib/dashboard/brief";

export interface ActionResult {
  ok: boolean;
  error?: string;
  /** Shown in the toast. */
  message?: string;
}

/** "Enter demo as Dana": signs this browser in as the demo practitioner, in its own sandbox (DECISIONS D-052). */
export async function enterDemo(): Promise<void> {
  const sandboxId = await ensureSandboxId();
  await setStaffCookie(DANA.id);
  const clinic = await getStore().getClinic(DANA.clinicId);
  if (clinic) await ensureDemoClients(clinic, sandboxId, await sandboxNow());
  redirect("/dashboard");
}

export async function signOut(): Promise<void> {
  await clearStaffCookie();
  redirect("/dashboard/enter");
}

/** Time travel (DECISIONS D-016): moves this sandbox's clock forward, never back. Demo mode only. */
export async function travel(days: number): Promise<ActionResult> {
  const session = await readSession();
  if (!session) return { ok: false, error: "Please sign in again." };
  if (!env.DEMO_MODE) return { ok: false, error: "Time travel is for the demo only." };
  if (!Number.isInteger(days) || days < 1 || days > 90) return { ok: false, error: "Pick a number of days to move forward." };
  const store = getStore();
  const sandbox = await store.getSandbox(session.sandboxId);
  if (!sandbox) return { ok: false, error: "Please sign in again." };
  try {
    await store.setClockOffset(session.sandboxId, sandbox.clockOffsetDays + days);
  } catch {
    // Another tab moved the clock first. Reloading shows where it is now.
  }
  revalidatePath("/dashboard", "layout");
  return { ok: true };
}

const draftInput = z.object({
  clientId: z.string().min(1),
  dedupeKey: z.string().min(1),
  subject: z.string().trim().min(1, "Add a subject.").max(200),
  body: z.string().trim().min(1, "Write a message first.").max(5000),
});

/**
 * Sends one rebook message, exactly as Dana edited it. The queue is worked out again on the server, so only an
 * item that is really waiting can be sent, and the outbox's dedupe key means it can only go once.
 * In demo mode the message is logged on screen, never emailed (brief section 5).
 */
export async function sendRebook(input: z.input<typeof draftInput>): Promise<ActionResult> {
  const parsed = draftInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the message." };
  if (!(await readSession())) return { ok: false, error: "Please sign in again." };
  const book = await loadBook();
  const item = book.queue.items.find((i) => i.clientId === parsed.data.clientId && i.dedupeKey === parsed.data.dedupeKey);
  if (!item || item.action !== "email") return { ok: false, error: "This one has already been handled." };
  const facts = book.facts.find((f) => f.client.id === item.clientId)!;
  const { subject, body } = parsed.data;
  const issues = checkCopy(`${subject}\n${body}`);
  if (issues.length > 0) return { ok: false, error: `Please reword "${issues[0].match}". It isn't in the clinic's voice.` };

  // Real email only for a real client, outside demo mode, with Resend set up (DECISIONS D-008).
  const live = !env.DEMO_MODE && features.email && Boolean(env.EMAIL_FROM) && !facts.client.isDemo && Boolean(facts.client.email);
  let status: "sent" | "failed" = "sent";
  if (live) {
    try {
      const { error } = await resend().emails.send({ from: env.EMAIL_FROM!, to: facts.client.email!, subject, text: body });
      if (error) status = "failed";
    } catch {
      status = "failed";
    }
  }
  const sentAt = book.now.toISOString();
  const message = await getStore().addMessage({
    clinicId: book.clinic.id,
    clientId: item.clientId,
    sandboxId: book.sandboxId,
    type: item.kind,
    channel: "email",
    subject,
    body,
    status,
    dedupeKey: item.dedupeKey,
    scheduledFor: null,
    sentAt: status === "sent" ? sentAt : null,
    createdAt: sentAt,
  });
  revalidatePath("/dashboard", "layout");
  if (!message) return { ok: false, error: "This one has already been sent." };
  if (status === "failed") return { ok: false, error: "The email didn't go through. It's in the outbox to try again." };
  const name = facts.client.firstName ?? "the client";
  return { ok: true, message: live ? `Sent to ${name}.` : `Sent to ${name}. Logged in the outbox, not emailed (demo).` };
}

const doneInput = z.object({ clientId: z.string().min(1), dedupeKey: z.string().min(1) });

/** For calls and reviews: marks the item done, with a line in the outbox so the queue remembers. */
export async function markDone(input: z.input<typeof doneInput>): Promise<ActionResult> {
  const parsed = doneInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Something went wrong. Please try again." };
  if (!(await readSession())) return { ok: false, error: "Please sign in again." };
  const book = await loadBook();
  const item = book.queue.items.find((i) => i.clientId === parsed.data.clientId && i.dedupeKey === parsed.data.dedupeKey);
  if (!item) return { ok: false, error: "This one has already been handled." };
  const at = book.now.toISOString();
  const what = item.action === "call" ? "Called" : item.action === "review" ? "Plan reviewed" : "Handled";
  await getStore().addMessage({
    clinicId: book.clinic.id,
    clientId: item.clientId,
    sandboxId: book.sandboxId,
    type: item.kind,
    channel: "email",
    subject: null,
    body: `${what} by ${book.staff.name}.`,
    status: "skipped",
    dedupeKey: item.dedupeKey,
    scheduledFor: null,
    sentAt: null,
    createdAt: at,
  });
  revalidatePath("/dashboard", "layout");
  return { ok: true, message: `${what}. Moved to done.` };
}

/** Undo for "Mark as called" and "Mark as reviewed". A sent email can't be taken back, so this never touches one. */
export async function undoDone(input: z.input<typeof doneInput>): Promise<ActionResult> {
  const parsed = doneInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Something went wrong. Please try again." };
  const session = await readSession();
  if (!session) return { ok: false, error: "Please sign in again." };
  const book = await loadBook();
  if (!book.facts.some((f) => f.client.id === parsed.data.clientId)) return { ok: false, error: "We couldn't find this client." };
  const undone = await getStore().removeSkippedMessage(parsed.data.clientId, parsed.data.dedupeKey);
  revalidatePath("/dashboard", "layout");
  return undone ? { ok: true, message: "Back in the queue." } : { ok: false, error: "Nothing to undo." };
}

const noteInput = z.object({ clientId: z.string().min(1), note: z.string().max(1200) });

/** Dana's note, shown on the client's report. */
export async function saveNote(input: z.input<typeof noteInput>): Promise<ActionResult> {
  const parsed = noteInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Keep the note under 1,200 characters." };
  if (!(await readSession())) return { ok: false, error: "Please sign in again." };
  const book = await loadBook();
  const facts = book.facts.find((f) => f.client.id === parsed.data.clientId);
  if (!facts?.report) return { ok: false, error: "This client has no report yet." };
  const note = parsed.data.note.trim();
  const issues = checkCopy(note);
  if (issues.length > 0) return { ok: false, error: `Please reword "${issues[0].match}". It isn't in the clinic's voice.` };
  await getStore().setPractitionerNote(facts.client.id, note || null);
  revalidatePath(`/dashboard/clients/${facts.client.id}`);
  return { ok: true, message: note ? "Note saved. It shows on the client's report." : "Note removed." };
}

/**
 * "Confirm plan with client" (brief 3.2). Confirms a proposed plan, or, for a client who has only their
 * report, saves the plan the report suggests with today's menu prices.
 */
export async function confirmPlan(input: { clientId: string }): Promise<ActionResult> {
  if (!(await readSession())) return { ok: false, error: "Please sign in again." };
  const book = await loadBook();
  const facts = book.facts.find((f) => f.client.id === input.clientId);
  if (!facts) return { ok: false, error: "We couldn't find this client." };
  const store = getStore();

  if (facts.plan?.status === "proposed") {
    const done = await store.confirmPlan(facts.plan.id, book.staff.id, book.now);
    revalidatePath("/dashboard", "layout");
    return done ? { ok: true, message: "Plan confirmed." } : { ok: false, error: "This plan is already confirmed." };
  }
  if (facts.plan && facts.plan.status === "confirmed") return { ok: false, error: "This plan is already confirmed." };

  const suggested = suggestedPlan(book, facts);
  if (!suggested) return { ok: false, error: "There's no scan to build a plan from yet." };
  const planId = newId();
  const lines = suggested.plan.recommended.lines;
  const firstSession = (treatmentId: string) =>
    suggested.plan.timeline.find((s) => s.kind === "session" && s.treatment.id === treatmentId && s.first);
  const items: PlanItem[] = [
    ...lines.map((line, position) => {
      const first = firstSession(line.treatment.id);
      return {
        id: newId(),
        planId,
        treatmentId: line.treatment.id,
        productId: null,
        quantity: line.sessions,
        unitPriceCents: line.treatment.priceCents,
        position,
        targetDate: first?.date ?? null,
      };
    }),
    ...suggested.plan.homeCare.map(({ product }, i) => ({
      id: newId(),
      planId,
      treatmentId: null,
      productId: product.id,
      quantity: 1,
      unitPriceCents: product.priceCents,
      position: lines.length + i,
      targetDate: null,
    })),
  ];
  const saved = await store.createPlan(
    {
      id: planId,
      clientId: facts.client.id,
      scanId: suggested.scan.id,
      status: "confirmed",
      confirmedBy: book.staff.id,
      confirmedAt: book.now.toISOString(),
      totalCents: items.reduce((n, i) => n + i.quantity * i.unitPriceCents, 0),
      createdAt: book.now.toISOString(),
    },
    items,
  );
  revalidatePath("/dashboard", "layout");
  return saved ? { ok: true, message: "Plan confirmed." } : { ok: false, error: "This client already has a plan." };
}
