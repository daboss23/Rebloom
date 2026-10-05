import "server-only";
// Per-browser sandboxes (DECISIONS D-013). Reading is allowed anywhere; creating sets a
// cookie, which Next only permits in Server Actions and Route Handlers.

import { createHash } from "node:crypto";
import { cookies, headers } from "next/headers";
import { env, localSecret } from "@/lib/env";
import { newId } from "@/lib/ids";
import { getStore } from "@/lib/store";
import { virtualNow } from "@/lib/clock";

export const SANDBOX_COOKIE = "rb_sandbox";
export const SANDBOX_TTL_DAYS = 30;
const visitCookie = (clinicSlug: string) => `rb_visit_${clinicSlug}`;

const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: SANDBOX_TTL_DAYS * 86_400,
};

export async function readSandboxId(): Promise<string | null> {
  return (await cookies()).get(SANDBOX_COOKIE)?.value ?? null;
}

/** Server Actions and Route Handlers only. */
export async function ensureSandboxId(): Promise<string> {
  const jar = await cookies();
  let id = jar.get(SANDBOX_COOKIE)?.value;
  if (!id || !(await getStore().getSandbox(id))) {
    id = newId();
    await getStore().createSandbox(id, new Date());
    jar.set(SANDBOX_COOKIE, id, cookieOptions);
  }
  return id;
}

/** The client this browser is currently scanning as, for one clinic. */
export async function readVisitClientId(clinicSlug: string): Promise<string | null> {
  return (await cookies()).get(visitCookie(clinicSlug))?.value ?? null;
}

export async function setVisitClientId(clinicSlug: string, clientId: string): Promise<void> {
  (await cookies()).set(visitCookie(clinicSlug), clientId, cookieOptions);
}

export async function clearVisitClientId(clinicSlug: string): Promise<void> {
  (await cookies()).delete(visitCookie(clinicSlug));
}

/** The virtual "now" for this browser's sandbox (DECISIONS D-016). */
export async function sandboxNow(): Promise<Date> {
  const id = await readSandboxId();
  const sandbox = id ? await getStore().getSandbox(id) : null;
  return virtualNow({ demoToday: env.DEMO_TODAY, offsetDays: sandbox?.clockOffsetDays ?? 0 });
}

/** Salted hash of the caller's IP. Raw IPs are never stored (DECISIONS D-015). */
export async function requestIpHash(): Promise<string | null> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip");
  if (!ip) return null;
  return createHash("sha256").update(`${localSecret()}:${ip}`).digest("base64url").slice(0, 32);
}

export async function requestUserAgent(): Promise<string | null> {
  return (await headers()).get("user-agent")?.slice(0, 300) ?? null;
}
