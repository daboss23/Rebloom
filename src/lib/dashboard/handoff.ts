import "server-only";
// Links that carry a demo to any device (DECISIONS D-088, D-090). Without logins, a demo lives in the browser that
// opened it (D-013): a judge who scans on their phone and opens the dashboard on their laptop would find two demos,
// and their own scan missing from the dashboard. Each link carries a signed token naming the demo's sandbox and one
// thing in it; opening the link joins that sandbox on whatever device it's opened on.
//
// Each purpose signs with its own key, so a token made for one can't be replayed as another:
// - answer: a reply alert's Answer button, to the client's conversation. Goes to the address the clinic chose.
// - brief: "See this from the clinic's side", from a judge's own report and report email, to their brief.
// - scan: the dashboard's code to scan yourself in on a phone, to that clinic's scan page.

import { createHmac, timingSafeEqual } from "node:crypto";
import { env, localSecret } from "@/lib/env";

/** Long enough for a link read days later, shorter than the sandbox's own 30 days. */
export const HANDOFF_DAYS = 14;

export type HandoffPurpose = "answer" | "brief" | "scan";

/** "answer" keeps the key it shipped with, so alerts already sent keep working. */
const KEYS: Record<HandoffPurpose, string> = { answer: "dashboard-handoff", brief: "handoff:brief", scan: "handoff:scan" };

const sign = (purpose: HandoffPurpose, payload: Buffer) =>
  createHmac("sha256", `${localSecret()}:${KEYS[purpose]}`).update(payload).digest().subarray(0, 12);

const uuidBytes = (id: string): Buffer | null => {
  const hex = id.replace(/-/g, "").toLowerCase();
  return /^[0-9a-f]{32}$/.test(hex) ? Buffer.from(hex, "hex") : null;
};

const uuid = (bytes: Buffer) => {
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

/**
 * 64 URL-safe characters: the sandbox, the subject (a client, or a clinic for "scan"), when it expires, and a
 * signature over all three. Expiry is on real time, never the demo's clock.
 */
export function handoffToken(purpose: HandoffPurpose, sandboxId: string, subjectId: string, now = new Date()): string | null {
  const sandbox = uuidBytes(sandboxId);
  const subject = uuidBytes(subjectId);
  if (!sandbox || !subject) return null;
  const expires = Buffer.alloc(4);
  expires.writeUInt32BE(Math.floor(now.getTime() / 1000) + HANDOFF_DAYS * 86_400);
  const payload = Buffer.concat([sandbox, subject, expires]);
  return Buffer.concat([payload, sign(purpose, payload)]).toString("base64url");
}

/** The sandbox and subject a token names, when it was signed for this purpose and hasn't expired. */
export function readHandoffToken(purpose: HandoffPurpose, token: string, now = new Date()): { sandboxId: string; subjectId: string } | null {
  if (!/^[A-Za-z0-9_-]{64}$/.test(token)) return null;
  const bytes = Buffer.from(token, "base64url");
  if (bytes.length !== 48) return null;
  const payload = bytes.subarray(0, 36);
  if (!timingSafeEqual(sign(purpose, payload), bytes.subarray(36))) return null;
  if (payload.readUInt32BE(32) * 1000 < now.getTime()) return null;
  return { sandboxId: uuid(payload.subarray(0, 16)), subjectId: uuid(payload.subarray(16, 32)) };
}

/** The alert's link: through the handoff for a demo client, straight to the brief otherwise. */
export function answerLink(home: string, client: { id: string; sandboxId: string | null }, now = new Date()): string {
  const token = client.sandboxId ? handoffToken("answer", client.sandboxId, client.id, now) : null;
  return token ? `${home}/dashboard/open/${token}` : `${home}/dashboard/clients/${client.id}#conversation`;
}

/**
 * "See this from the clinic's side": a judge's own scan, opened in the demo dashboard as Dana sees it. Only in demo
 * mode, and only for someone who scanned themselves: never a sample client, never a real clinic's client. Pass ""
 * as home for a link on the site itself.
 */
export function clinicSideLink(home: string, client: { id: string; sandboxId: string | null; demoKey: string | null }, now = new Date()): string | null {
  if (!env.DEMO_MODE || client.demoKey || !client.sandboxId) return null;
  const token = handoffToken("brief", client.sandboxId, client.id, now);
  return token ? `${home}/dashboard/open/${token}` : null;
}

/** The dashboard's code to scan yourself in on another device, into this same demo. */
export function scanLink(home: string, sandboxId: string, clinic: { id: string }, now = new Date()): string | null {
  const token = handoffToken("scan", sandboxId, clinic.id, now);
  return token ? `${home}/scan/${token}` : null;
}
