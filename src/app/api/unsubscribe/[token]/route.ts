// One-click unsubscribe (RFC 8058, DECISIONS D-086). Every reminder and progress email names this address in its
// List-Unsubscribe header; a mail app's own Unsubscribe button posts here, with no page in between. The signed token
// is the authority. A mail app that opens the address instead lands on the clinic's unsubscribe page.
import { revalidatePath } from "next/cache";
import { clientIdFromUnsubscribeToken, setEmailPreference } from "@/lib/email/unsubscribe";
import { json } from "@/lib/scans/access";
import { getStore } from "@/lib/store";

export async function POST(_request: Request, ctx: RouteContext<"/api/unsubscribe/[token]">) {
  const clientId = clientIdFromUnsubscribeToken((await ctx.params).token);
  if (!clientId) return json({ error: "This link isn't valid." }, 404);
  const client = await getStore().getClient(clientId);
  // Details already deleted: nothing will be emailed, which is what was asked.
  if (!client) return json({ unsubscribed: true });
  await setEmailPreference({ id: client.clinicId }, clientId, "out", "mail_app");
  revalidatePath("/dashboard", "layout");
  return json({ unsubscribed: true });
}

export async function GET(request: Request, ctx: RouteContext<"/api/unsubscribe/[token]">) {
  const { token } = await ctx.params;
  const clientId = clientIdFromUnsubscribeToken(token);
  const client = clientId ? await getStore().getClient(clientId) : null;
  const clinic = client ? await getStore().getClinic(client.clinicId) : null;
  if (!clinic) return new Response("Nothing to unsubscribe. These details are no longer held.", { status: 404, headers: { "content-type": "text/plain; charset=utf-8" } });
  // Seeing the page is never the unsubscribe itself: link checkers open every link in an email.
  return Response.redirect(new URL(`/c/${clinic.slug}/unsubscribe/${token}`, request.url), 303);
}
