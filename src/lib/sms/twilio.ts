import "server-only";
// Texts through Twilio's REST API (DECISIONS D-080). Server only: the auth token never reaches a browser.
// Plain fetch on purpose: one endpoint doesn't justify Twilio's SDK.

import { createHmac, timingSafeEqual } from "node:crypto";
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

/**
 * Twilio's signature on a webhook (X-Twilio-Signature): HMAC-SHA1 of the exact URL it called, followed by every
 * posted field and its value in key order, with the auth token. Proves a reply really came through Twilio (D-081).
 */
export function twilioSignature(url: string, params: URLSearchParams, authToken: string): string {
  const keys = [...new Set(params.keys())].sort();
  const data = url + keys.map((k) => params.getAll(k).map((v) => `${k}${v}`).join("")).join("");
  return createHmac("sha1", authToken).update(data, "utf8").digest("base64");
}

/** True when the signature matches one of the URLs Twilio might have called. */
export function validTwilioSignature(urls: string[], params: URLSearchParams, signature: string | null): boolean {
  if (!signature || !env.TWILIO_AUTH_TOKEN) return false;
  const given = Buffer.from(signature);
  return urls.some((url) => {
    const expected = Buffer.from(twilioSignature(url, params, env.TWILIO_AUTH_TOKEN!));
    return expected.length === given.length && timingSafeEqual(expected, given);
  });
}
