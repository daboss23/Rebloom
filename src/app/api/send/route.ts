import { z } from "zod";
import { hintFor } from "@/lib/email/hints";
import { senderAddress } from "@/lib/email/report";
import { resend } from "@/lib/email/resend";
import { env, features } from "@/lib/env";
import { json } from "@/lib/scans/access";
import { setupAuthorized } from "@/lib/setup/auth";

const body = z.object({ to: z.email().optional() });

/**
 * Sends one test email through the same sender the report email uses (DECISIONS D-050, D-062), and says
 * what's set up. Needs `Authorization: Bearer <CRON_SECRET>`, like the YouCam check, so nobody else can send
 * from this account. Optional JSON body `{ "to": "someone@example.com" }`.
 */
export async function POST(request: Request) {
  if (!setupAuthorized(request)) return json({ error: "Not found" }, 404);
  const parsed = body.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return json({ error: { message: "`to` must be an email address." } }, 400);
  const from = `"Rebloom test" <${senderAddress(env.EMAIL_FROM)}>`;
  const to = parsed.data.to ?? "mindblastmarketing@gmail.com";
  const setup = { resendKey: features.email, emailFrom: env.EMAIL_FROM ?? null, sender: senderAddress(env.EMAIL_FROM), to };
  if (!features.email) return json({ error: { message: "RESEND_API_KEY is not set on this deployment." }, setup }, 500);
  try {
    const { data, error } = await resend().emails.send({
      from,
      to,
      subject: "Rebloom test email",
      html: "<p>If you can read this, Rebloom can send email from this deployment.</p>",
    });
    if (error || !data) {
      const message = error?.message ?? "Resend returned no email id.";
      return json({ error: { ...error, message }, hint: hintFor(message), setup }, 500);
    }
    return json({ id: data.id, setup });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Couldn't reach Resend.";
    return json({ error: { message }, hint: hintFor(message), setup }, 500);
  }
}
