// A reply alert's "Answer" link (DECISIONS D-088). The signed token names a demo's sandbox and a client: this browser
// joins that sandbox, signed in as the clinic's practitioner, and lands on the client's conversation. So the alert
// works on whatever device it's read on. Anything that doesn't check out goes to the dashboard's front door.
import { cookies } from "next/headers";
import { readHandoffToken } from "@/lib/dashboard/handoff";
import { STAFF_COOKIE, setStaffCookie } from "@/lib/dashboard/session";
import { joinSandbox } from "@/lib/sandbox";
import { getStore } from "@/lib/store";

export async function GET(request: Request, ctx: RouteContext<"/dashboard/open/[token]">) {
  const door = Response.redirect(new URL("/dashboard/enter", request.url), 303);
  const handoff = readHandoffToken((await ctx.params).token);
  if (!handoff) return door;

  const store = getStore();
  const [sandbox, client] = await Promise.all([store.getSandbox(handoff.sandboxId), store.getClient(handoff.clientId)]);
  // The demo was cleared (30 days), or the client was deleted from it.
  if (!sandbox || !client || client.sandboxId !== handoff.sandboxId) return door;

  // Whoever is already signed in here, if they work at this client's clinic; else its first practitioner.
  const staff = await store.listStaff(client.clinicId);
  const current = (await cookies()).get(STAFF_COOKIE)?.value;
  const who = staff.find((s) => s.id === current) ?? staff.find((s) => s.role === "practitioner") ?? staff[0];
  if (!who) return door;

  await joinSandbox(handoff.sandboxId);
  await setStaffCookie(who.id);
  return Response.redirect(new URL(`/dashboard/clients/${client.id}#conversation`, request.url), 303);
}
