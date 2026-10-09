"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { DANA } from "@/data/staff";
import { checkCopy } from "@/lib/copy/check";
import { loadBook } from "@/lib/dashboard/load";
import { clearStaffCookie, readSession, setStaffCookie } from "@/lib/dashboard/session";
import { ensureDemoClients } from "@/lib/demo/ensure";
import { env, features } from "@/lib/env";
import { hintFor } from "@/lib/email/hints";
import { answerEmail } from "@/lib/email/answer";
import { DEMO_COPY_LIMIT, DEMO_COPY_TYPE, demoCopyKey, foreignLinks, rebookEmail } from "@/lib/email/rebook";
import { resend } from "@/lib/email/resend";
import { replyTo } from "@/lib/replies/address";
import { addressOf } from "@/lib/replies/parse";
import { ANSWER_TYPE, HANDLED_TYPE, canAnswerByText, handledKey, replySubject, threadSubject } from "@/lib/replies/thread";
import { TEXT_MAX_CHARS, TEXT_OPT_OUT, toUsE164 } from "@/lib/sms/text";
import { sendText } from "@/lib/sms/twilio";
import { appOrigin } from "@/lib/origin";
import { ensureSandboxId, sandboxNow } from "@/lib/sandbox";
import { getStore } from "@/lib/store";
import { keptPlan } from "@/lib/plan/keep";
import { suggestedPlan } from "@/lib/dashboard/brief";
import { fullName } from "@/lib/dashboard/view";

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
  /** Demo mode only: the address of whoever is trying the demo, for a real copy of the email. */
  copyTo: z.union([z.literal(""), z.email("That email address doesn't look right.").max(254)]).optional(),
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
      const mail = rebookEmail({ clinic: book.clinic, subject, body });
      const { error } = await resend().emails.send({
        from: mail.from,
        to: facts.client.email!,
        // Their answer lands on the brief (D-081).
        replyTo: replyTo(book.clinic, facts.client.id),
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
      });
      if (error) status = "failed";
    } catch {
      status = "failed";
    }
  }

  // Demo mode: the client is a sample, so a real copy can go to whoever is trying the demo (DECISIONS D-064).
  // It goes first, so if it can't be sent nothing has happened yet and the sheet stays open to try again.
  const copyTo = env.DEMO_MODE && features.email && parsed.data.copyTo ? parsed.data.copyTo : null;
  const name = facts.client.firstName ?? "the client";
  if (copyTo) {
    const copies = book.input.messages.filter((m) => m.type === DEMO_COPY_TYPE && m.status === "sent").length;
    if (copies >= DEMO_COPY_LIMIT) return { ok: false, error: `This demo has sent its ${DEMO_COPY_LIMIT} copies. Clear the address to log the message without one.` };
    if (foreignLinks(`${subject}\n${body}`, await appOrigin()).length > 0) {
      return { ok: false, error: "In the demo, a copy can only link to this app. Remove the other link, or clear the address." };
    }
    const mail = rebookEmail({ clinic: book.clinic, subject, body, demoFor: fullName(facts.client) });
    let failure: string | null = null;
    try {
      const { error } = await resend().emails.send(
        // A reply to the copy lands on the sample client's brief, in this browser's demo (D-081).
        { from: mail.from, to: copyTo, replyTo: replyTo(book.clinic, facts.client.id), subject: mail.subject, text: mail.text, html: mail.html },
        // One email per row and address, even if Send is pressed twice. The key stays short whatever the address.
        { idempotencyKey: `${book.sandboxId}:${demoCopyKey(item.dedupeKey)}:${createHash("sha256").update(copyTo).digest("hex").slice(0, 16)}` },
      );
      if (error) failure = error.message;
    } catch (e) {
      failure = e instanceof Error ? e.message : "Couldn't reach Resend.";
    }
    if (failure) {
      console.error(`Demo copy not sent: ${failure}`);
      return { ok: false, error: `The copy couldn't be emailed. ${hintFor(failure) ?? "Please try again, or clear the address to log it without one."}` };
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
  if (copyTo) {
    // Counted against this browser's copies. The address itself isn't kept.
    await getStore()
      .addMessage({
        clinicId: book.clinic.id,
        clientId: item.clientId,
        sandboxId: book.sandboxId,
        type: DEMO_COPY_TYPE,
        channel: "email",
        subject,
        body,
        status: "sent",
        dedupeKey: demoCopyKey(item.dedupeKey),
        scheduledFor: null,
        sentAt,
        createdAt: sentAt,
      })
      .catch((e) => console.error(`Demo copy not recorded: ${e instanceof Error ? e.message : String(e)}`));
    return { ok: true, message: `Logged for ${name}, and a real copy is on its way to ${copyTo}.` };
  }
  return { ok: true, message: live ? `Sent to ${name}.` : `Sent to ${name}. Logged in the outbox, not emailed (demo).` };
}

const textInput = z.object({
  clientId: z.string().min(1),
  dedupeKey: z.string().min(1),
  body: z.string().trim().min(1, "Write a message first.").max(TEXT_MAX_CHARS, `Keep it under ${TEXT_MAX_CHARS} characters.`),
});

/**
 * Sends one rebook message as a text, exactly as Dana edited it (DECISIONS D-080). The same guarantees as an
 * email: the queue is worked out again here, only a client who said yes to texts can get one, and the outbox's
 * dedupe key means it goes once. In demo mode it is logged in the outbox, never sent.
 */
export async function sendRebookText(input: z.input<typeof textInput>): Promise<ActionResult> {
  const parsed = textInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the message." };
  if (!(await readSession())) return { ok: false, error: "Please sign in again." };
  const book = await loadBook();
  const item = book.queue.items.find((i) => i.clientId === parsed.data.clientId && i.dedupeKey === parsed.data.dedupeKey);
  if (!item || !item.text) return { ok: false, error: "This one has already been handled." };
  const facts = book.facts.find((f) => f.client.id === item.clientId)!;
  const to = toUsE164(facts.client.phone);
  if (!to) return { ok: false, error: "There's no mobile number to text." };
  const { body } = parsed.data;
  const issues = checkCopy(body);
  if (issues.length > 0) return { ok: false, error: `Please reword "${issues[0].match}". It isn't in the clinic's voice.` };
  // Every text carries the way out, so it stays in however the rest is edited.
  if (!/\bSTOP\b/.test(body)) return { ok: false, error: `Keep "${TEXT_OPT_OUT}" at the end of the text.` };

  const name = facts.client.firstName ?? "the client";
  // Real texts only for a real client, outside demo mode, with Twilio set up.
  const live = !env.DEMO_MODE && features.sms && !facts.client.isDemo;
  const sentAt = book.now.toISOString();
  const record = (status: "sent" | "failed") =>
    getStore().addMessage({
      clinicId: book.clinic.id,
      clientId: item.clientId,
      sandboxId: book.sandboxId,
      type: item.kind,
      channel: "sms",
      subject: null,
      body,
      status,
      // A failed text keeps no dedupe key, so the item stays in the queue to email, call or try again.
      dedupeKey: status === "sent" ? item.dedupeKey : null,
      scheduledFor: null,
      sentAt: status === "sent" ? sentAt : null,
      createdAt: sentAt,
    });

  if (live) {
    const result = await sendText({ to, body });
    if (!result.ok) {
      await record("failed");
      revalidatePath("/dashboard", "layout");
      return {
        ok: false,
        error: result.optedOut
          ? `${name} replied STOP to the clinic's texts, so it can't reach them. Try email or a call.`
          : "The text didn't go through. Please try again.",
      };
    }
  }
  const message = await record("sent");
  revalidatePath("/dashboard", "layout");
  if (!message) return { ok: false, error: "This one has already been sent." };
  return { ok: true, message: live ? `Texted ${name}.` : `Texted ${name}. Logged in the outbox, not sent (demo).` };
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

const answerInput = z.object({
  clientId: z.string().min(1),
  channel: z.enum(["email", "text"]),
  body: z.string().trim().min(1, "Write a message first.").max(5000, "Keep it under 5,000 characters."),
  /** Made once per answer in the browser, so pressing Send twice sends once. */
  nonce: z.string().min(8).max(64),
});

/** Answers a demo browser can email back to whoever replied to one of its copies (D-064, D-081). */
const DEMO_ANSWER_LIMIT = 3;

/**
 * Dana writes to a client from their brief (DECISIONS D-081): usually an answer to their reply, by email or by text.
 * The same guarantees as a rebook message: the clinic's voice, one send per press, real only for real clients outside
 * demo mode. In the demo, when someone trying it replied to a copy, the answer goes back to them as a copy too.
 */
export async function answerClient(input: z.input<typeof answerInput>): Promise<ActionResult> {
  const parsed = answerInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the message." };
  if (!(await readSession())) return { ok: false, error: "Please sign in again." };
  const book = await loadBook();
  const facts = book.facts.find((f) => f.client.id === parsed.data.clientId);
  if (!facts) return { ok: false, error: "We couldn't find this client." };
  const { channel, body, nonce } = parsed.data;
  const { client, reply } = facts;
  const name = client.firstName ?? "the client";
  const issues = checkCopy(body);
  if (issues.length > 0) return { ok: false, error: `Please reword "${issues[0].match}". It isn't in the clinic's voice.` };

  const to = channel === "email" ? client.email : toUsE164(client.phone);
  if (!to) return { ok: false, error: channel === "email" ? "There's no email address to write to." : "There's no mobile number to text." };
  if (channel === "text") {
    if (!canAnswerByText({ phone: client.phone, canText: facts.canText, messages: facts.messages })) {
      return { ok: false, error: `${name} hasn't said yes to texts, or replied STOP. Answer by email instead.` };
    }
    if (body.length > TEXT_MAX_CHARS) return { ok: false, error: `Keep a text under ${TEXT_MAX_CHARS} characters.` };
  }

  const subject = channel === "email" ? replySubject(reply?.channel === "email" ? reply.subject : threadSubject(facts.messages), `A note from ${book.clinic.name}`) : null;
  const when = (iso: string) =>
    new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: book.clinic.timezone }).format(new Date(iso));
  const quoted = reply?.channel === "email" ? { who: name, when: when(reply.sentAt ?? reply.createdAt), text: reply.body } : null;
  const live = !env.DEMO_MODE && !client.isDemo && (channel === "email" ? features.email : features.sms);
  let status: "sent" | "failed" = "sent";
  if (live && channel === "email") {
    try {
      const mail = answerEmail({ clinic: book.clinic, subject: subject!, body, signedBy: book.staff.name, quoted });
      const { error } = await resend().emails.send(
        { from: mail.from, to, replyTo: replyTo(book.clinic, client.id), subject: mail.subject, text: mail.text, html: mail.html },
        { idempotencyKey: `answer:${client.id}:${nonce}` },
      );
      if (error) status = "failed";
    } catch {
      status = "failed";
    }
  } else if (live) {
    const result = await sendText({ to, body });
    if (!result.ok) {
      revalidatePath("/dashboard", "layout");
      return {
        ok: false,
        error: result.optedOut ? `${name} replied STOP to the clinic's texts, so it can't reach them. Answer by email.` : "The text didn't go through. Please try again.",
      };
    }
  }

  // Demo mode: whoever is trying it replied to a copy, from their own address. They get the answer, marked as a demo.
  const store = getStore();
  // Only a reply that really arrived carries a sender; the demo's own sample replies don't.
  const replier = reply?.channel === "email" ? addressOf(reply.sender) : null;
  const demoTo = env.DEMO_MODE && features.email && channel === "email" && client.isDemo && replier && replier !== client.email?.toLowerCase() ? replier : null;
  let copied = false;
  if (demoTo) {
    const used = book.input.messages.filter((m) => m.type === DEMO_COPY_TYPE && m.dedupeKey?.startsWith("demo_copy:answer:")).length;
    if (used < DEMO_ANSWER_LIMIT && foreignLinks(body, await appOrigin()).length === 0) {
      const mail = answerEmail({ clinic: book.clinic, subject: subject!, body, signedBy: book.staff.name, quoted, demoFor: fullName(client) });
      try {
        const { error } = await resend().emails.send(
          { from: mail.from, to: demoTo, replyTo: replyTo(book.clinic, client.id), subject: mail.subject, text: mail.text, html: mail.html },
          { idempotencyKey: `${book.sandboxId}:demo_answer:${nonce}` },
        );
        copied = !error;
        if (error) console.error(`Demo answer not sent: ${error.message}`);
      } catch (e) {
        console.error(`Demo answer not sent: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  const sentAt = book.now.toISOString();
  const message = await store.addMessage({
    clinicId: book.clinic.id,
    clientId: client.id,
    sandboxId: book.sandboxId,
    type: ANSWER_TYPE,
    channel: channel === "text" ? "sms" : "email",
    subject,
    body,
    status,
    dedupeKey: `answer:${nonce}`,
    scheduledFor: null,
    sentAt: status === "sent" ? sentAt : null,
    createdAt: sentAt,
  });
  if (copied) {
    await store
      .addMessage({
        clinicId: book.clinic.id,
        clientId: client.id,
        sandboxId: book.sandboxId,
        type: DEMO_COPY_TYPE,
        channel: "email",
        subject,
        body,
        status: "sent",
        dedupeKey: `demo_copy:answer:${nonce}`,
        scheduledFor: null,
        sentAt,
        createdAt: sentAt,
      })
      .catch((e) => console.error(`Demo answer not recorded: ${e instanceof Error ? e.message : String(e)}`));
  }
  revalidatePath("/dashboard", "layout");
  if (!message) return { ok: false, error: "This one has already been sent." };
  if (status === "failed") return { ok: false, error: "The email didn't go through. Please try again." };
  if (copied) return { ok: true, message: `Logged for ${name}, and the answer is on its way to ${demoTo}.` };
  const how = channel === "text" ? "Texted" : "Sent to";
  return { ok: true, message: live ? `${how} ${name}.` : `${how} ${name}. Logged here, not ${channel === "text" ? "sent" : "emailed"} (demo).` };
}

/** "Mark as handled": the reply needed no answer (a thank-you). A line in the conversation that Undo can take back. */
export async function markReplyHandled(input: { clientId: string }): Promise<ActionResult & { dedupeKey?: string }> {
  if (typeof input?.clientId !== "string") return { ok: false, error: "Something went wrong. Please try again." };
  if (!(await readSession())) return { ok: false, error: "Please sign in again." };
  const book = await loadBook();
  const facts = book.facts.find((f) => f.client.id === input.clientId);
  if (!facts?.reply) return { ok: false, error: "Nothing is waiting on an answer." };
  const at = book.now.toISOString();
  const dedupeKey = handledKey(facts.reply.id);
  await getStore().addMessage({
    clinicId: book.clinic.id,
    clientId: facts.client.id,
    sandboxId: book.sandboxId,
    type: HANDLED_TYPE,
    channel: facts.reply.channel,
    subject: null,
    body: `Marked as handled by ${book.staff.name}.`,
    status: "skipped",
    dedupeKey,
    scheduledFor: null,
    sentAt: null,
    createdAt: at,
  });
  revalidatePath("/dashboard", "layout");
  return { ok: true, message: "Marked as handled.", dedupeKey };
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
  const kept = keptPlan({
    plan: suggested.plan,
    clientId: facts.client.id,
    scanId: suggested.scan.id,
    status: "confirmed",
    confirmedBy: book.staff.id,
    now: book.now,
  });
  const saved = await store.createPlan(kept.plan, kept.items);
  revalidatePath("/dashboard", "layout");
  return saved ? { ok: true, message: "Plan confirmed." } : { ok: false, error: "This client already has a plan." };
}

/** The owner's switch for deposits at booking (DECISIONS D-066). In the demo it holds for this browser's sandbox only. */
export async function setDepositRequired(input: { on: boolean }): Promise<ActionResult> {
  if (typeof input?.on !== "boolean") return { ok: false, error: "Something went wrong. Please try again." };
  const session = await readSession();
  if (!session) return { ok: false, error: "Please sign in again." };
  await getStore().setClinicSettings(session.clinic.id, session.sandboxId, { depositRequired: input.on }, await sandboxNow());
  revalidatePath("/dashboard/settings");
  return { ok: true, message: input.on ? "Deposits are on. New bookings take one." : "Deposits are off. Clients book with no payment." };
}
