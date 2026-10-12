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
import { canWriteByEmail } from "@/lib/email/opt-out";
import { resend } from "@/lib/email/resend";
import { setEmailPreference, unsubscribeLinks } from "@/lib/email/unsubscribe";
import { replyTo } from "@/lib/replies/address";
import { addressOf } from "@/lib/replies/parse";
import { ANSWER_TYPE, HANDLED_TYPE, canAnswerByText, handledKey, replySubject, threadSubject } from "@/lib/replies/thread";
import { TEXT_MAX_CHARS, TEXT_OPT_OUT, formatUsPhone, toUsE164 } from "@/lib/sms/text";
import { sendText } from "@/lib/sms/twilio";
import { appOrigin } from "@/lib/origin";
import { ensureSandboxId, sandboxNow } from "@/lib/sandbox";
import { sandboxClock, virtualNow } from "@/lib/clock";
import { JUMP_HORIZON_DAYS, nextOpening, offsetTo, openingsAhead } from "@/lib/demo/next-opening";
import { getStore } from "@/lib/store";
import { keptPlan } from "@/lib/plan/keep";
import { suggestedPlan } from "@/lib/dashboard/brief";
import { fullName } from "@/lib/dashboard/view";
import { retryDraft } from "@/lib/agent/desk";

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
  if (!Number.isInteger(days) || days < 1 || days > JUMP_HORIZON_DAYS) return { ok: false, error: "Pick a number of days to move forward." };
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

/**
 * The demo clock's jump to the next opening (DECISIONS D-091): forward to the moment the clinic next opens, so a
 * demo opened in the evening can be seen as the day begins. Forward only, like every jump.
 */
export async function travelToOpening(): Promise<ActionResult> {
  const session = await readSession();
  if (!session) return { ok: false, error: "Please sign in again." };
  if (!env.DEMO_MODE) return { ok: false, error: "Time travel is for the demo only." };
  const store = getStore();
  const sandbox = await store.getSandbox(session.sandboxId);
  if (!sandbox) return { ok: false, error: "Please sign in again." };
  const now = virtualNow(sandboxClock(env.DEMO_TODAY, sandbox));
  const opening = nextOpening(now, session.clinic);
  if (!opening) return { ok: false, error: "The clinic has no opening hours set." };
  return jumpTo(session.sandboxId, opening);
}

/** The demo clock's calendar: lands on the opening of the day picked. Forward only, within 90 days, open days only. */
export async function travelToDay(day: string): Promise<ActionResult> {
  const session = await readSession();
  if (!session) return { ok: false, error: "Please sign in again." };
  if (!env.DEMO_MODE) return { ok: false, error: "Time travel is for the demo only." };
  const store = getStore();
  const sandbox = await store.getSandbox(session.sandboxId);
  if (!sandbox) return { ok: false, error: "Please sign in again." };
  const now = virtualNow(sandboxClock(env.DEMO_TODAY, sandbox));
  const opening = openingsAhead(now, session.clinic).find((o) => o.day === day);
  if (!opening) return { ok: false, error: `Pick a day the clinic is open, within the next ${JUMP_HORIZON_DAYS} days.` };
  return jumpTo(session.sandboxId, opening.at);
}

/** Sets the sandbox's clock to land exactly on `target`, which callers have already checked is later than now. */
async function jumpTo(sandboxId: string, target: Date): Promise<ActionResult> {
  const { days, minutes } = offsetTo(target, virtualNow({ demoToday: env.DEMO_TODAY }));
  try {
    await getStore().setClockOffset(sandboxId, days, minutes);
  } catch (e) {
    // Before the clock-minutes migration, only the jumps to an opening need it; the day steps still work.
    if (e instanceof Error && /clock_offset_minutes/.test(e.message)) {
      return { ok: false, error: "This jump needs the latest database update (pnpm db:migrate)." };
    }
    // Otherwise another tab moved the clock first. Reloading shows where it is now.
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
  const who = book.facts.find((f) => f.client.id === parsed.data.clientId);
  // They may have unsubscribed while the sheet was open: the queue, worked out again, no longer offers the email.
  if (item && item.action !== "email" && who?.unsubscribedAt) {
    return { ok: false, error: `${who.client.firstName ?? "This client"} has unsubscribed from the clinic's emails, so this can't go by email.` };
  }
  if (!item || item.action !== "email") return { ok: false, error: "This one has already been handled." };
  const facts = book.facts.find((f) => f.client.id === item.clientId)!;
  const { subject, body } = parsed.data;
  const issues = checkCopy(`${subject}\n${body}`);
  if (issues.length > 0) return { ok: false, error: `Please reword "${issues[0].match}". It isn't in the clinic's voice.` };
  // Every reminder and progress email carries the way out: a link at the foot, and the headers behind a mail app's
  // own Unsubscribe button (D-086). On a demo copy it unsubscribes the sample client, in this browser's demo.
  const origin = await appOrigin();
  const way = unsubscribeLinks(origin, book.clinic, facts.client.id);

  // Real email only for a real client, outside demo mode, with Resend set up (DECISIONS D-008).
  const live = !env.DEMO_MODE && features.email && Boolean(env.EMAIL_FROM) && !facts.client.isDemo && Boolean(facts.client.email);
  let status: "sent" | "failed" = "sent";
  if (live) {
    try {
      const mail = rebookEmail({ clinic: book.clinic, subject, body, unsubscribeUrl: way?.page });
      const { error } = await resend().emails.send({
        from: mail.from,
        to: facts.client.email!,
        // Their answer lands on the brief (D-081).
        replyTo: replyTo(book.clinic, facts.client.id),
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
        headers: way?.headers,
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
    if (foreignLinks(`${subject}\n${body}`, origin).length > 0) {
      return { ok: false, error: "In the demo, a copy can only link to this app. Remove the other link, or clear the address." };
    }
    const mail = rebookEmail({ clinic: book.clinic, subject, body, demoFor: fullName(facts.client), unsubscribeUrl: way?.page });
    let failure: string | null = null;
    try {
      const { error } = await resend().emails.send(
        // A reply to the copy lands on the sample client's brief, in this browser's demo (D-081).
        {
          from: mail.from,
          to: copyTo,
          replyTo: replyTo(book.clinic, facts.client.id),
          subject: mail.subject,
          text: mail.text,
          html: mail.html,
          headers: way?.headers,
        },
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
  // An unsubscribe is the client's to take back, on their own page (D-086), never the clinic's.
  if (parsed.data.dedupeKey.startsWith("email_preference:")) return { ok: false, error: "Nothing to undo." };
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
  /** The agent's draft this answer started from (D-093), so what Dana changed can teach the next one. */
  draftId: z.string().min(1).max(64).optional(),
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
  if (channel === "email" && !canWriteByEmail({ email: client.email, unsubscribedAt: facts.unsubscribedAt, messages: facts.messages })) {
    return { ok: false, error: `${name} unsubscribed from the clinic's emails. You can answer here once they write in.` };
  }
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
  // A real client who wrote in gets a real answer, demo mode or not, as booking emails do. Only the demo's sample
  // clients are logged and never sent (D-085).
  const live = !client.isDemo && (channel === "email" ? features.email : features.sms);
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
  // The draft it started from is done with: keep what Dana actually sent beside what the agent wrote (D-093).
  if (message && status === "sent" && parsed.data.draftId) {
    const draft = await store.getAgentDraft(parsed.data.draftId).catch(() => null);
    if (draft?.clientId === client.id) {
      await store
        .updateAgentDraft(draft.id, ["ready"], { status: "used", sentBody: body, updatedAt: new Date().toISOString() })
        .catch((e) => console.error(`Draft not marked used: ${e instanceof Error ? e.message : String(e)}`));
    }
  }
  revalidatePath("/dashboard", "layout");
  if (!message) return { ok: false, error: "This one has already been sent." };
  if (status === "failed") return { ok: false, error: "The email didn't go through. Please try again." };
  if (copied) return { ok: true, message: `Logged for ${name}, and the answer is on its way to ${demoTo}.` };
  const how = channel === "text" ? "Texted" : "Sent to";
  const why = client.isDemo ? "a sample client" : channel === "text" ? "texts aren't set up" : "email isn't set up";
  return { ok: true, message: live ? `${how} ${name}.` : `${how} ${name}. Logged here, not ${channel === "text" ? "sent" : "emailed"} (${why}).` };
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

/**
 * "Stop emails": the client asked the clinic, by a reply or on the phone, to stop emailing them (D-086). The same
 * unsubscribe as their own link, recorded in their conversation with Dana's name. Only the client can take it back.
 */
export async function stopEmails(input: { clientId: string }): Promise<ActionResult> {
  if (typeof input?.clientId !== "string") return { ok: false, error: "Something went wrong. Please try again." };
  if (!(await readSession())) return { ok: false, error: "Please sign in again." };
  const book = await loadBook();
  const facts = book.facts.find((f) => f.client.id === input.clientId);
  if (!facts?.client.email) return { ok: false, error: "There's no email address to stop." };
  const name = facts.client.firstName ?? "They";
  if (facts.unsubscribedAt) return { ok: true, message: `${name} has already unsubscribed.` };
  const now = await setEmailPreference(book.clinic, facts.client.id, "out", { staff: book.staff.name });
  revalidatePath("/dashboard", "layout");
  if (!now?.unsubscribedAt) return { ok: false, error: "That didn't save. Please try again." };
  return { ok: true, message: `Done. ${name} won't get reminder or update emails.` };
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

const alertsInput = z.object({
  email: z.union([z.literal(""), z.email("That email address doesn't look right.").max(254)]),
  phone: z.string().trim().max(30),
});

/**
 * Where reply alerts go (DECISIONS D-087): an email address, a US mobile, either or both. Empty turns that one off.
 * In the demo it holds for this browser's sandbox only, as the deposit switch does.
 */
export async function setReplyAlerts(input: z.input<typeof alertsInput>): Promise<ActionResult> {
  const parsed = alertsInput.safeParse({ email: String(input?.email ?? "").trim(), phone: String(input?.phone ?? "") });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Please check the details." };
  const session = await readSession();
  if (!session) return { ok: false, error: "Please sign in again." };
  const phone = parsed.data.phone ? toUsE164(parsed.data.phone) : null;
  if (parsed.data.phone && !phone) return { ok: false, error: "Please check the mobile number. Alerts go to US mobiles." };
  const email = parsed.data.email ? parsed.data.email.toLowerCase() : null;
  try {
    await getStore().setClinicSettings(session.clinic.id, session.sandboxId, { alertEmail: email, alertPhone: phone }, await sandboxNow());
  } catch (e) {
    console.error(`Reply alerts not saved: ${e instanceof Error ? e.message : String(e)}`);
    return { ok: false, error: "That didn't save. If the database was just updated, run its latest change (pnpm db:migrate)." };
  }
  revalidatePath("/dashboard/settings");
  if (!email && !phone) return { ok: true, message: "Reply alerts are off." };
  return { ok: true, message: `Saved. Replies are sent to ${[email, phone && formatUsPhone(phone)].filter(Boolean).join(" and ")} as they land.` };
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

/** Sets the agent's draft aside (D-093). Dana writes her own; nothing was sent. */
export async function dismissDraft(input: { draftId: string }): Promise<ActionResult> {
  if (typeof input?.draftId !== "string") return { ok: false, error: "Something went wrong. Please try again." };
  const session = await readSession();
  if (!session) return { ok: false, error: "Please sign in again." };
  const store = getStore();
  const draft = await store.getAgentDraft(input.draftId).catch(() => null);
  if (!draft || draft.sandboxId !== session.sandboxId) return { ok: false, error: "We couldn't find that draft." };
  await store.updateAgentDraft(draft.id, ["ready", "failed"], { status: "dismissed", updatedAt: new Date().toISOString() });
  revalidatePath("/dashboard", "layout");
  return { ok: true };
}

/** "Try again" on a draft the agent couldn't finish (D-093). */
export async function redraft(input: { draftId: string }): Promise<ActionResult> {
  if (typeof input?.draftId !== "string") return { ok: false, error: "Something went wrong. Please try again." };
  const session = await readSession();
  if (!session) return { ok: false, error: "Please sign in again." };
  const draft = await getStore().getAgentDraft(input.draftId).catch(() => null);
  if (!draft || draft.sandboxId !== session.sandboxId) return { ok: false, error: "We couldn't find that draft." };
  const started = await retryDraft(draft, await appOrigin());
  return started ? { ok: true } : { ok: false, error: "Rebloom can't draft this one just now. Please write it yourself." };
}
