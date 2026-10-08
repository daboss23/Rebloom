import "server-only";
// Texts through Twilio's REST API (DECISIONS D-080). Server only: the auth token never reaches a browser.
// Plain fetch on purpose: one endpoint doesn't justify Twilio's SDK.

import { env, features } from "@/lib/env";

export type TextResult = { ok: true; sid: string } | { ok: false; error: string; optedOut: boolean };

/** Twilio's code for a number that replied STOP. Carriers enforce it; we say so plainly. */
export const TWILIO_OPTED_OUT = 21610;

/** Sends one text to a US number already in "+1…" form. Never throws. */
export async function sendText({ to, body }: { to: string; body: string }): Promise<TextResult> {
  if (!features.sms) return { ok: false, error: "Texts aren't set up.", optedOut: false };
  const sid = env.TWILIO_ACCOUNT_SID!;
  const from = env.TWILIO_FROM!;
  const form = new URLSearchParams({ To: to, Body: body });
  form.set(from.startsWith("MG") ? "MessagingServiceSid" : "From", from);
  try {
    const res = await fetch(`${env.TWILIO_API_BASE}/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`, {
      method: "POST",
      headers: {
        authorization: `Basic ${Buffer.from(`${sid}:${env.TWILIO_AUTH_TOKEN}`).toString("base64")}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: form,
      signal: AbortSignal.timeout(10_000),
    });
    const json = (await res.json().catch(() => ({}))) as { sid?: string; code?: number; message?: string };
    if (res.ok && json.sid) return { ok: true, sid: json.sid };
    return { ok: false, error: json.message ?? `Twilio answered ${res.status}.`, optedOut: json.code === TWILIO_OPTED_OUT };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Couldn't reach Twilio.", optedOut: false };
  }
}
