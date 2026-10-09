"use server";
// The unsubscribe page's two buttons (DECISIONS D-086). The signed token is the authority, as the report token is for
// the report: no sign-in, nothing to type, one press.

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { clientIdFromUnsubscribeToken, setEmailPreference } from "@/lib/email/unsubscribe";
import { loadClinic } from "@/lib/flow/load";

async function choose(slug: string, token: string, choice: "out" | "in"): Promise<void> {
  const clinic = await loadClinic(slug);
  const clientId = clientIdFromUnsubscribeToken(token);
  if (clientId) {
    await setEmailPreference(clinic, clientId, choice, "page");
    revalidatePath("/dashboard", "layout");
  }
  // Back to the page, which reads where they stand now: a reload never presses the button again.
  redirect(`/c/${slug}/unsubscribe/${token}${choice === "in" ? "?kept=1" : ""}`);
}

export async function unsubscribe(slug: string, token: string): Promise<void> {
  await choose(slug, token, "out");
}

export async function keepEmails(slug: string, token: string): Promise<void> {
  await choose(slug, token, "in");
}
