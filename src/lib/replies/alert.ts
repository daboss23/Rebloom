import "server-only";
// Reply alerts (DECISIONS D-087): the clinic hears the moment a client writes back, by email or text, so "Can I come
// Thursday?" doesn't wait until someone opens the dashboard. Where they go is set in Settings. Every reply passes
// through saveReply, which calls this once the reply is kept: the webhooks and the dashboard's catch-up alike.

import type { Client, Clinic, Message } from "@/lib/domain";
import { answerLink } from "@/lib/dashboard/handoff";
import { escapeHtml as e, oneLine, senderAddress } from "@/lib/email/report";
import { resend } from "@/lib/email/resend";
import { env, features } from "@/lib/env";
import { appOrigin } from "@/lib/origin";
import { sendText } from "@/lib/sms/twilio";
import { toUsE164 } from "@/lib/sms/text";
import { getStore } from "@/lib/store";
import { optKeyword } from "./parse";
import { at, isReply, waitingReply } from "./thread";

/** A reply fetched later than this (the dashboard's catch-up, D-084) is old news: no alert. */
export const ALERT_FRESH_MS = 24 * 3_600_000;
/** A second message while the first still waits, within this, is the same conversation: one alert covers both. */
export const ALERT_BURST_MS = 60 * 60_000;
/** A safety valve: past this many replies in a day across one clinic's book, alerts pause until tomorrow. */
export const ALERTS_PER_BOOK_PER_DAY = 25;
const SEND_TIMEOUT_MS = 8_000;

/**
 * Whether a reply just kept is worth telling the clinic about now. Not a STOP or START (Twilio's business, never
 * waiting on Dana), not one that arrived long ago, and not the second line of a burst the first alert already covers.
 */
export function alertWorthy({ reply, before, receivedAt, now }: { reply: Message; before: Message[]; receivedAt: Date; now: Date }): boolean {
  if (reply.channel === "sms" && optKeyword(reply.body)) return false;
  if (now.getTime() - receivedAt.getTime() > ALERT_FRESH_MS) return false;
  const waiting = waitingReply(before);
  return !waiting || Date.parse(at(reply)) - Date.parse(at(waiting)) >= ALERT_BURST_MS;
}

const fullName = (c: Pick<Client, "firstName" | "lastName">) => [c.firstName, c.lastName].filter(Boolean).join(" ") || "A client";

/** The first words of a reply, on one line, cut at a word. */
function excerpt(text: string, max: number, more = "…"): string {
  const line = text.replace(/\s+/g, " ").trim();
  return line.length <= max ? line : `${line.slice(0, max).replace(/\s+\S*$/, "")}${more}`;
}

export interface AlertEmail {
  from: string;
  subject: string;
  text: string;
  html: string;
}

/**
 * The alert as an email: who wrote, how and when, their words, and a gold button to answer on their brief. From
 * Rebloom, since it goes to the clinic, not a client. A sample client's alert says plainly whose reply it really was.
 */
export function alertEmail({
  clinic,
  client,
  reply,
  when,
  link,
}: {
  clinic: Pick<Clinic, "name" | "wordmark">;
  client: Pick<Client, "firstName" | "lastName" | "isDemo">;
  reply: Pick<Message, "channel" | "subject" | "body" | "sender">;
  /** "Fri, Oct 9 · 2:14pm", in the clinic's time zone. */
  when: string;
  /** Their brief's conversation, or null when the app's address isn't known. */
  link: string | null;
}): AlertEmail {
  const name = oneLine(fullName(client));
  const first = oneLine(client.firstName ?? name);
  const how = reply.channel === "sms" ? "By text" : "By email";
  const words = excerpt(reply.body, 600);
  const cut = words.endsWith("…");
  const demoLine = client.isDemo
    ? `Rebloom demo: ${first} is a sample client. This reply came from ${oneLine(reply.sender ?? "someone trying the demo")}.`
    : null;
  const subject = `${name} wrote back`;
  const text = [
    demoLine,
    `${name} wrote back to ${clinic.name}.`,
    `${how} · ${when}${reply.channel === "email" && reply.subject ? ` · ${oneLine(reply.subject)}` : ""}`,
    `"${words}"`,
    link ? `Answer ${first}: ${link}` : `Answer ${first} from their brief in the dashboard.`,
    `You get this because reply alerts are on for ${clinic.name}. Change where they go in Settings.`,
  ]
    .filter(Boolean)
    .join("\n\n")
    .concat("\n\nRebloom");

  const html = `<!doctype html>
<html lang="en">
<body style="margin:0;padding:0;background:#edf3f6;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#edf3f6;padding:32px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:20px;font-family:Inter,Helvetica,Arial,sans-serif;color:#2e3f49;">
${demoLine ? `<tr><td style="padding:14px 32px;background:#0c1a22;border-radius:20px 20px 0 0;font-size:12.5px;line-height:1.5;color:#dbe8ef;">${e(demoLine)}</td></tr>\n` : ""}<tr><td style="padding:28px 32px 0;font-size:12px;letter-spacing:0.3em;text-transform:uppercase;color:#0c1a22;">${e(clinic.wordmark)} <span style="color:#1e5a78;letter-spacing:0.22em;">· Reply</span></td></tr>
<tr><td style="padding:22px 32px 0;font-family:'Cormorant Garamond',Georgia,serif;font-size:30px;line-height:1.15;font-weight:300;color:#0c1a22;">${e(first)} wrote back.</td></tr>
<tr><td style="padding:10px 32px 0;font-size:13px;line-height:1.5;color:#556773;">${e(name)} · ${e(how)} · ${e(when)}${reply.channel === "email" && reply.subject ? `<br>${e(oneLine(reply.subject))}` : ""}</td></tr>
<tr><td style="padding:18px 32px 0;"><div style="border-radius:16px;background:#f3f8fa;padding:16px 18px;font-size:15px;line-height:1.6;color:#0c1a22;white-space:pre-wrap;">${e(words)}</div>${cut ? `<div style="padding-top:8px;font-size:12.5px;color:#556773;">The rest is on their brief.</div>` : ""}</td></tr>
${link ? `<tr><td style="padding:24px 32px 0;"><a href="${e(link)}" style="display:inline-block;background:#d9ae62;background-image:linear-gradient(100deg,#c99645 0%,#f1d49a 45%,#d9ae62 70%,#b98a3c 100%);color:#1a1206;text-decoration:none;font-size:16px;padding:16px 28px;border-radius:14px;">Answer ${e(first)}</a></td></tr>\n` : ""}<tr><td style="padding:28px 32px 28px;"><div style="border-top:1px solid #e3ebef;padding-top:20px;font-size:13px;line-height:1.5;color:#556773;">You get this because reply alerts are on for ${e(clinic.name)}. Change where they go in Settings.<br><br>Rebloom</div></td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

  return { from: `"Rebloom" <${senderAddress(env.EMAIL_FROM)}>`, subject, text, html };
}

/** The alert as a text: who, their first words, and the link. Written to fit in two parts. */
export function alertText({ clinic, client, reply, link }: { clinic: Pick<Clinic, "name">; client: Pick<Client, "firstName" | "lastName">; reply: Pick<Message, "body">; link: string | null }): string {
  const lead = `Rebloom: ${fullName(client)} wrote back to ${clinic.name}: "`;
  const tail = `"${link ? ` Answer: ${link}` : ""}`;
  // "..." rather than "…": one character outside the texting alphabet makes every part less than half as long.
  return `${lead}${excerpt(reply.body, Math.max(40, 300 - lead.length - tail.length), "...")}${tail}`;
}

export type AlertOutcome = "sent" | "skipped" | "failed";

/** The app's own address, for the link to the brief: APP_URL, else the host this request came to, else none. */
async function origin(): Promise<string | null> {
  if (env.APP_URL) return env.APP_URL.replace(/\/$/, "");
  return appOrigin().catch(() => null);
}

/**
 * Tells the clinic about a reply just kept, by email and text, wherever Settings says. Never throws: the reply is
 * kept either way, and a failed alert is only logged. `before` is the client's conversation before this reply.
 */
export async function alertClinic(input: { client: Client; reply: Message; before: Message[]; receivedAt: Date }): Promise<AlertOutcome> {
  const { client, reply } = input;
  try {
    const store = getStore();
    const settings = await store.getClinicSettings(client.clinicId, client.sandboxId);
    const email = features.email ? settings.alertEmail : null;
    const phone = features.sms ? toUsE164(settings.alertPhone) : null;
    if (!email && !phone) return "skipped";
    if (!alertWorthy({ ...input, now: new Date() })) return "skipped";

    // The safety valve, on the book's own clock: replies are kept on it (D-016).
    if (client.sandboxId) {
      const since = Date.parse(at(reply)) - 86_400_000;
      const today = (await store.listMessages(client.clinicId, client.sandboxId)).filter((m) => isReply(m) && Date.parse(at(m)) > since && m.id !== reply.id);
      if (today.length >= ALERTS_PER_BOOK_PER_DAY) {
        console.error(`Reply alert paused: ${today.length} replies in a day for one clinic's book.`);
        return "skipped";
      }
    }

    const clinic = await store.getClinic(client.clinicId);
    if (!clinic) return "skipped";
    const home = await origin();
    const link = home ? answerLink(home, client) : null;
    const sent = new Date(at(reply));
    const day = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: clinic.timezone }).format(sent);
    const time = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: clinic.timezone }).format(sent).replace(/\s/g, "").toLowerCase();
    const when = `${day} · ${time}`;

    const sends: Promise<boolean>[] = [];
    if (email) {
      const mail = alertEmail({ clinic, client, reply, when, link });
      sends.push(
        withTimeout(resend().emails.send({ from: mail.from, to: email, subject: mail.subject, text: mail.text, html: mail.html }, { idempotencyKey: `reply_alert:${reply.id}` })).then(
          ({ error }) => {
            if (error) console.error(`Reply alert email not sent (${error.name}): ${error.message}`);
            return !error;
          },
        ),
      );
    }
    if (phone) {
      sends.push(
        sendText({ to: phone, body: alertText({ clinic, client, reply, link }) }).then((r) => {
          if (!r.ok) console.error(`Reply alert text not sent: ${r.error}`);
          return r.ok;
        }),
      );
    }
    const results = await Promise.all(sends.map((p) => p.catch((err) => (console.error(`Reply alert not sent: ${err instanceof Error ? err.message : String(err)}`), false))));
    return results.some(Boolean) ? "sent" : "failed";
  } catch (err) {
    console.error(`Reply alert failed: ${err instanceof Error ? err.message : String(err)}`);
    return "failed";
  }
}

function withTimeout<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("Resend didn't answer in time.")), SEND_TIMEOUT_MS);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
