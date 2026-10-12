import "server-only";
// Dana's answer to a client's reply, as an email (DECISIONS D-081). A letter, not a campaign: her words, her name, the
// clinic's, and what the client wrote quoted underneath, the way any mail app would. Replies to it come back to the
// client's own reply address.

import type { Clinic } from "@/lib/domain";
import { env } from "@/lib/env";
import { escapeHtml as e, oneLine, senderAddress } from "./report";

export interface AnswerEmail {
  from: string;
  subject: string;
  text: string;
  html: string;
}

/**
 * `quoted` is the reply being answered. `demoFor` names the sample client whose conversation this is, for a copy
 * sent to whoever wrote in during the demo, and says so on top.
 */
export function answerEmail({
  clinic,
  subject,
  body,
  signedBy,
  quoted,
  demoFor,
}: {
  clinic: Clinic;
  subject: string;
  body: string;
  signedBy: string;
  quoted?: { who: string; when: string; text: string } | null;
  demoFor?: string;
}): AnswerEmail {
  const cleanSubject = oneLine(subject);
  const paragraphs = body
    .replace(/\r\n?/g, "\n")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  const demoLine = demoFor
    ? `Rebloom demo: this is ${clinic.name}'s answer in ${demoFor}'s conversation, a sample client. It came to you because you replied to the demo.`
    : null;
  const quote = quoted ? `On ${quoted.when}, ${quoted.who} wrote:\n${quoted.text.split("\n").map((l) => `> ${l}`).join("\n")}` : null;
  // Signed already ("Speak soon,\nDana"): the clinic's details go underneath without her name twice.
  const lastLine = (paragraphs[paragraphs.length - 1] ?? "").split("\n").pop()?.trim().toLowerCase() ?? "";
  const signed = lastLine === signedBy.trim().toLowerCase();
  const text = [demoLine, ...paragraphs, `${signed ? "" : `${signedBy}\n`}${clinic.name}\n${clinic.address}`, quote].filter(Boolean).join("\n\n");

  const linkify = (s: string) =>
    e(s).replace(/https?:\/\/[^\s<>"&]+(?:&amp;[^\s<>"&]+)*/g, (url) => `<a href="${url}" style="color:#1e5a78;word-break:break-all;">${url}</a>`);
  const rows = paragraphs.map((p) => `<p style="margin:0 0 14px;">${linkify(p).replace(/\n/g, "<br>")}</p>`).join("\n");
  const html = `<!doctype html>
<html lang="en">
<body style="margin:0;padding:0;background:#ffffff;">
<div style="max-width:560px;padding:24px 20px;font-family:Inter,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.65;color:#2e3f49;">
${demoLine ? `<p style="margin:0 0 20px;padding:12px 16px;background:#0c1a22;border-radius:12px;font-size:12.5px;line-height:1.5;color:#dbe8ef;">${e(demoLine)}</p>\n` : ""}${rows}
<p style="margin:22px 0 0;">${signed ? "" : `${e(signedBy)}<br>`}<span style="color:#556773;">${e(clinic.name)} · ${e(clinic.address)}</span></p>
${quoted ? `<p style="margin:28px 0 6px;font-size:13px;color:#556773;">On ${e(quoted.when)}, ${e(quoted.who)} wrote:</p>\n<blockquote style="margin:0;padding:0 0 0 14px;border-left:2px solid #d5e1e7;font-size:13.5px;color:#556773;">${e(quoted.text).replace(/\n/g, "<br>")}</blockquote>` : ""}
</div>
</body>
</html>`;

  const from = `"${clinic.name.replace(/["\\]/g, "")}" <${senderAddress(env.EMAIL_FROM)}>`;
  return { from, subject: cleanSubject, text, html };
}
