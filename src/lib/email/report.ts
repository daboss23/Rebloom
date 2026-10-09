import "server-only";
// The report email: the client's private link, sent the moment they ask for their results at the gate
// (brief 3.1 step 6, DECISIONS D-062). It comes from the clinic's name; Rebloom is the small line at the end.

import type { Clinic } from "@/lib/domain";
import { env, features } from "@/lib/env";
import { replyTo } from "@/lib/replies/address";
import { getStore } from "@/lib/store";
import { resend } from "./resend";

/** What the confirmation can honestly say: sent, tried and not sent, or email isn't set up. */
export type ReportDelivery = "sent" | "not_sent" | "off";

/** Resend's shared test sender. It only delivers to the address that owns the Resend account. */
export const TEST_SENDER = "onboarding@resend.dev";
/** Long enough for Resend on a slow day, short enough that the gate never hangs. */
const SEND_TIMEOUT_MS = 10_000;

/** The report email goes out whenever Resend has a key. EMAIL_FROM is the sender once a domain is verified. */
export function reportEmailLive(): boolean {
  return features.email;
}

/** "Rebloom <reports@rebloom.app>" to "reports@rebloom.app". */
export function senderAddress(from: string | undefined): string {
  if (!from) return TEST_SENDER;
  return (from.match(/<([^>]+)>/)?.[1] ?? from).trim();
}

/** The outbox key for one scan's report email, so it's sent and recorded once. */
export const reportDedupeKey = (scanId: string) => `report_link:${scanId}`;

export const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
/** Typed by the client: one line, no control characters, so it can't reshape a header. */
export const oneLine = (s: string) => s.replace(/[\u0000-\u001f\u007f]+/g, " ").trim();

export interface ReportEmail {
  from: string;
  subject: string;
  text: string;
  html: string;
}

/** The email itself, in the clinic's voice (brief 7.7). Pure, so it can be tested without sending anything. */
export function reportEmail({ clinic, firstName, url }: { clinic: Clinic; firstName: string; url: string }): ReportEmail {
  const name = oneLine(firstName);
  const subject = `${name}, your skin report from ${clinic.name}`;
  const lines = [
    `Hi ${name},`,
    `Your skin report from ${clinic.name} is ready. It shows your three priorities on your own photo, a plan built from our treatment menu, and every price upfront.`,
    `Open your report: ${url}`,
    "The link is private and yours to keep. Come back to it after every visit to see your progress.",
    `When you're ready, book your first visit from your report, or call us on ${clinic.phone}.`,
    `${clinic.name}\n${clinic.address}`,
    "You're receiving this because you asked for your results after your skin scan. You can delete your photo and details at any time from your report.",
  ];
  const text = `${lines.join("\n\n")}\n\nPowered by Rebloom`;

  const e = escapeHtml;
  const html = `<!doctype html>
<html lang="en">
<body style="margin:0;padding:0;background:#edf3f6;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#edf3f6;padding:32px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:20px;font-family:Inter,Helvetica,Arial,sans-serif;color:#2e3f49;">
<tr><td style="padding:28px 32px 0;font-size:12px;letter-spacing:0.3em;text-transform:uppercase;color:#0c1a22;">${e(clinic.wordmark)}</td></tr>
<tr><td style="padding:24px 32px 0;font-family:'Cormorant Garamond',Georgia,serif;font-size:32px;line-height:1.1;font-weight:300;color:#0c1a22;">${e(name)}, your skin report is ready.</td></tr>
<tr><td style="padding:16px 32px 0;font-size:15px;line-height:1.6;">It shows your three priorities on your own photo, a plan built from our treatment menu, and every price upfront.</td></tr>
<tr><td style="padding:28px 32px 0;">
<a href="${e(url)}" style="display:inline-block;background:#d9ae62;background-image:linear-gradient(100deg,#c99645 0%,#f1d49a 45%,#d9ae62 70%,#b98a3c 100%);color:#1a1206;text-decoration:none;font-size:16px;padding:16px 28px;border-radius:14px;">Open my report</a>
</td></tr>
<tr><td style="padding:24px 32px 0;font-size:14px;line-height:1.6;">The link is private and yours to keep. Come back to it after every visit to see your progress. When you're ready, book your first visit from your report, or call us on ${e(clinic.phone)}.</td></tr>
<tr><td style="padding:24px 32px 0;font-size:13px;line-height:1.5;color:#556773;">If the button doesn't work, copy this link into your browser:<br><a href="${e(url)}" style="color:#1e5a78;word-break:break-all;">${e(url)}</a></td></tr>
<tr><td style="padding:28px 32px 28px;font-size:13px;line-height:1.5;color:#556773;border-top:1px solid #e3ebef;">${e(clinic.name)} · ${e(clinic.address)}<br>You're receiving this because you asked for your results after your skin scan. You can delete your photo and details at any time from your report.<br><br>Powered by Rebloom</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

  // The clinic's name on the envelope; the address is whatever sender Resend has verified.
  const from = `"${clinic.name.replace(/["\\]/g, "")}" <${senderAddress(env.EMAIL_FROM)}>`;
  return { from, subject, text, html };
}

/**
 * Sends one scan's report email and records it in the clinic's outbox. Never throws: if Resend says no,
 * the client still opens the report from the screen, and the confirmation says it wasn't emailed.
 */
export async function sendReportEmail(input: {
  clinic: Clinic;
  clientId: string;
  sandboxId: string | null;
  scanId: string;
  firstName: string;
  email: string;
  url: string;
  now: Date;
}): Promise<ReportDelivery> {
  if (!reportEmailLive()) return "off";
  const store = getStore();
  const dedupeKey = reportDedupeKey(input.scanId);
  // Asked twice for the same scan: one email, not two. (Resend's idempotency key backs this up.)
  const earlier = await reportDelivery(input.clinic.id, input.clientId, input.sandboxId, input.scanId).catch(() => "not_sent");
  if (earlier === "sent") return "sent";

  const message = reportEmail({ clinic: input.clinic, firstName: input.firstName, url: input.url });
  let delivered = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("Resend didn't answer in time.")), SEND_TIMEOUT_MS);
    });
    const { error } = await Promise.race([
      resend().emails.send(
        // Replies come back to the client's own address and land on their brief (D-081).
        { from: message.from, to: input.email, replyTo: replyTo(input.clinic, input.clientId), subject: message.subject, text: message.text, html: message.html },
        { idempotencyKey: dedupeKey },
      ),
      timeout,
    ]);
    if (error) console.error(`Report email not sent (${error.name}): ${error.message}`);
    delivered = !error;
  } catch (e) {
    console.error(`Report email not sent: ${e instanceof Error ? e.message : String(e)}`);
  } finally {
    clearTimeout(timer);
  }

  // The outbox is a record, not the delivery: if writing it fails, what the client was told still stands.
  await store
    .addMessage({
      clinicId: input.clinic.id,
      clientId: input.clientId,
      sandboxId: input.sandboxId,
      type: "report_link",
      channel: "email",
      subject: message.subject,
      body: message.text,
      status: delivered ? "sent" : "failed",
      dedupeKey,
      scheduledFor: null,
      sentAt: delivered ? input.now.toISOString() : null,
      createdAt: input.now.toISOString(),
    })
    .catch((e) => console.error(`Report email not recorded in the outbox: ${e instanceof Error ? e.message : String(e)}`));
  return delivered ? "sent" : "not_sent";
}

/** What happened to this scan's report email, from the outbox. */
export async function reportDelivery(clinicId: string, clientId: string, sandboxId: string | null, scanId: string): Promise<ReportDelivery> {
  if (!reportEmailLive()) return "off";
  if (!sandboxId) return "not_sent";
  const key = reportDedupeKey(scanId);
  const messages = await getStore().listMessages(clinicId, sandboxId);
  return messages.some((m) => m.clientId === clientId && m.dedupeKey === key && m.status === "sent") ? "sent" : "not_sent";
}
