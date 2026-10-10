import "server-only";
// The way back into a demo from any device (DECISIONS D-088). A demo lives in the browser that opened it (D-013), so a
// reply alert's "Answer" link, opened on a phone, used to land in a fresh demo without the client in it. The link now
// carries a signed token naming the demo's sandbox and the client; opening it joins that sandbox and goes to the brief.
// Only the alert carries it, and the alert only goes to the address the clinic chose, like a magic link would.

import { createHmac, timingSafeEqual } from "node:crypto";
import { localSecret } from "@/lib/env";

/** Long enough for an alert read days later, shorter than the sandbox's own 30 days. */
export const HANDOFF_DAYS = 14;

const sign = (payload: Buffer) => createHmac("sha256", `${localSecret()}:dashboard-handoff`).update(payload).digest().subarray(0, 12);

const uuidBytes = (id: string): Buffer | null => {
  const hex = id.replace(/-/g, "").toLowerCase();
  return /^[0-9a-f]{32}$/.test(hex) ? Buffer.from(hex, "hex") : null;
};

const uuid = (bytes: Buffer) => {
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

/** 64 URL-safe characters: the sandbox, the client, when it expires, and a signature over all three. */
export function handoffToken(sandboxId: string, clientId: string, now = new Date()): string | null {
  const sandbox = uuidBytes(sandboxId);
  const client = uuidBytes(clientId);
  if (!sandbox || !client) return null;
  const expires = Buffer.alloc(4);
  expires.writeUInt32BE(Math.floor(now.getTime() / 1000) + HANDOFF_DAYS * 86_400);
  const payload = Buffer.concat([sandbox, client, expires]);
  return Buffer.concat([payload, sign(payload)]).toString("base64url");
}

/** The sandbox and client a token names, while its signature holds and it hasn't expired. */
export function readHandoffToken(token: string, now = new Date()): { sandboxId: string; clientId: string } | null {
  if (!/^[A-Za-z0-9_-]{64}$/.test(token)) return null;
  const bytes = Buffer.from(token, "base64url");
  if (bytes.length !== 48) return null;
  const payload = bytes.subarray(0, 36);
  if (!timingSafeEqual(sign(payload), bytes.subarray(36))) return null;
  if (payload.readUInt32BE(32) * 1000 < now.getTime()) return null;
  return { sandboxId: uuid(payload.subarray(0, 16)), clientId: uuid(payload.subarray(16, 32)) };
}

/** The alert's link: through the handoff for a demo client, straight to the brief otherwise. */
export function answerLink(home: string, client: { id: string; sandboxId: string | null }, now = new Date()): string {
  const token = client.sandboxId ? handoffToken(client.sandboxId, client.id, now) : null;
  return token ? `${home}/dashboard/open/${token}` : `${home}/dashboard/clients/${client.id}#conversation`;
}
