import "server-only";
import { headers } from "next/headers";
import { env } from "@/lib/env";

/** The address clients open their report on. APP_URL when set, otherwise the host this request came to. */
export async function appOrigin(): Promise<string> {
  if (env.APP_URL) return env.APP_URL.replace(/\/$/, "");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
