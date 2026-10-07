import "server-only";
// A rebook message as an email: exactly the words Dana sent, in the clinic's frame (DECISIONS D-053, D-064).
// In demo mode the queue's clients are samples, so a real copy can go to whoever is trying the demo instead.

import type { Clinic } from "@/lib/domain";
import { env } from "@/lib/env";
import { escapeHtml as e, oneLine, senderAddress } from "./report";

/** Demo copies one browser can send. Enough to try every email in the queue, too few to be worth abusing. */
export const DEMO_COPY_LIMIT = 3;
/** The outbox type for a demo copy. Not a rebook trigger, so the outbox list doesn't show the message twice. */
export const DEMO_COPY_TYPE = "demo_copy";
export const demoCopyKey = (dedupeKey: string) => `demo_copy:${dedupeKey}`;

const URL_RE = /https?:\/\/[^\s<>"]+/g;

/** Every link in the text that doesn't point at this app. A demo copy may only carry the app's own links. */
export function foreignLinks(text: string, origin: string): string[] {
  const home = origin.replace(/\/$/, "");
  return (text.match(URL_RE) ?? []).filter((url) => url !== home && !url.startsWith(`${home}/`));
}

export interface RebookEmail {
  from: string;
  subject: string;
  text: string;
  html: string;
}

/**
 * A paragraph that is only a report link, or its progress scan link (D-073), becomes the gold button; any other
 * link stays a plain link.
 */
const REPORT_LINK = /^https?:\/\/\S+\/r\/[\w-]+(\/rescan)?\/?$/;

/**
 * The email, from the clinic's name. `demoFor` names the sample client whose message this is, and adds a line
 * at the top saying so, so a copy can never pass for the clinic writing to the person who receives it.
 */
export function rebookEmail({ clinic, subject, body, demoFor }: { clinic: Clinic; subject: string; body: string; demoFor?: string }): RebookEmail {
  const cleanSubject = oneLine(subject);
  const paragraphs = body
    .replace(/\r\n?/g, "\n")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  const demoLine = demoFor
    ? `Rebloom demo: this is the email ${demoFor}, a sample client, would receive from ${clinic.name}. It came to you because you asked for a copy.`
    : null;
  const text = [demoLine, ...paragraphs].filter(Boolean).join("\n\n") + `\n\n${clinic.name}\n${clinic.address}\n\nPowered by Rebloom`;

  const linkify = (s: string) =>
    e(s).replace(/https?:\/\/[^\s<>"&]+(?:&amp;[^\s<>"&]+)*/g, (url) => `<a href="${url}" style="color:#1e5a78;word-break:break-all;">${url}</a>`);
  const rows = paragraphs
    .map((p) =>
      REPORT_LINK.test(p)
        ? `<tr><td style="padding:22px 32px 4px;"><a href="${e(p)}" style="display:inline-block;background:#d9ae62;background-image:linear-gradient(100deg,#c99645 0%,#f1d49a 45%,#d9ae62 70%,#b98a3c 100%);color:#1a1206;text-decoration:none;font-size:16px;padding:16px 28px;border-radius:14px;">${/\/rescan\/?$/.test(p) ? "Start your progress scan" : "Open your report"}</a></td></tr>`
        : `<tr><td style="padding:16px 32px 0;font-size:15px;line-height:1.65;">${linkify(p).replace(/\n/g, "<br>")}</td></tr>`,
    )
    .join("\n");

  const html = `<!doctype html>
<html lang="en">
<body style="margin:0;padding:0;background:#edf3f6;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#edf3f6;padding:32px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:20px;font-family:Inter,Helvetica,Arial,sans-serif;color:#2e3f49;">
${demoLine ? `<tr><td style="padding:14px 32px;background:#0c1a22;border-radius:20px 20px 0 0;font-size:12.5px;line-height:1.5;color:#dbe8ef;">${e(demoLine)}</td></tr>\n` : ""}<tr><td style="padding:28px 32px 0;font-size:12px;letter-spacing:0.3em;text-transform:uppercase;color:#0c1a22;">${e(clinic.wordmark)}</td></tr>
<tr><td style="padding:22px 32px 4px;font-family:'Cormorant Garamond',Georgia,serif;font-size:30px;line-height:1.15;font-weight:300;color:#0c1a22;">${e(cleanSubject)}</td></tr>
${rows}
<tr><td style="padding:28px 32px 28px;"><div style="border-top:1px solid #e3ebef;padding-top:20px;font-size:13px;line-height:1.5;color:#556773;">${e(clinic.name)} · ${e(clinic.address)}<br><br>Powered by Rebloom</div></td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

  const from = `"${clinic.name.replace(/["\\]/g, "")}" <${senderAddress(env.EMAIL_FROM)}>`;
  return { from, subject: cleanSubject, text, html };
}
