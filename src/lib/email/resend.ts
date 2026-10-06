import "server-only";
// Email through Resend. Server only: the `server-only` import makes the build fail if a client
// component ever pulls this in, so the API key can never reach a browser.

import { Resend } from "resend";
import { env } from "@/lib/env";

let client: Resend | undefined;

export function resend(): Resend {
  if (!env.RESEND_API_KEY) throw new Error("RESEND_API_KEY is not set.");
  client ??= new Resend(env.RESEND_API_KEY);
  return client;
}
