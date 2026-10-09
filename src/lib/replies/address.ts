import "server-only";
// Every email to a client carries a reply address that is theirs alone (DECISIONS D-081):
// "r-<client id>-<signature>@reply.yourdomain.com". Resend receives it on a subdomain, so the clinic's own inbox is
// untouched, and the signature means nobody can make up an address for a client they don't already have mail from.

import { createHmac, timingSafeEqual } from "node:crypto";
import type { Clinic } from "@/lib/domain";
import { env, features, localSecret } from "@/lib/env";

const sign = (hex: string) => createHmac("sha256", `${localSecret()}:reply-address`).update(hex).digest("hex").slice(0, 16);

const LOCAL_PART = /^r-([0-9a-f]{32})-([0-9a-f]{16})$/;

/** The client's own reply address, or null while replies aren't set up (no REPLY_DOMAIN). */
export function replyAddress(clientId: string): string | null {
  if (!features.replies) return null;
  const hex = clientId.replace(/-/g, "").toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(hex)) return null;
  return `r-${hex}-${sign(hex)}@${env.REPLY_DOMAIN}`;
}

/** The Reply-To for an email to this client: the clinic's name, on the client's own address. */
export function replyTo(clinic: Pick<Clinic, "name">, clientId: string): string | undefined {
  const address = replyAddress(clientId);
  return address ? `"${clinic.name.replace(/["\\]/g, "")}" <${address}>` : undefined;
}

/** The client a reply address belongs to, when its signature holds. Any domain: Resend only delivers ours. */
export function clientIdFromAddress(address: string): string | null {
  const local = address.trim().toLowerCase().split("@")[0] ?? "";
  const match = local.match(LOCAL_PART);
  if (!match) return null;
  const [, hex, signature] = match;
  const expected = Buffer.from(sign(hex));
  if (!timingSafeEqual(expected, Buffer.from(signature))) return null;
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
