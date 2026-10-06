import { resend } from "@/lib/email/resend";
import { json } from "@/lib/scans/access";
import { setupAuthorized } from "@/lib/setup/auth";

/**
 * Sends one test email to check the Resend connection (DECISIONS D-050).
 * Needs `Authorization: Bearer <CRON_SECRET>`, like the YouCam check, so nobody else can send from this account.
 */
export async function POST(request: Request) {
  if (!setupAuthorized(request)) return json({ error: "Not found" }, 404);
  try {
    const { data, error } = await resend().emails.send({
      from: "onboarding@resend.dev",
      to: "mindblastmarketing@gmail.com",
      subject: "Hello World",
      html: "<p>Congrats on sending your <strong>first email</strong>!</p>",
    });
    if (error || !data) return json({ error: error ?? { message: "Resend returned no email id." } }, 500);
    return json({ id: data.id });
  } catch (error) {
    return json({ error: { message: error instanceof Error ? error.message : "Couldn't reach Resend." } }, 500);
  }
}
