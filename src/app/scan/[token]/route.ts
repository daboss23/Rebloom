// The dashboard's code to scan yourself in (DECISIONS D-090). A judge looking at the demo dashboard on a laptop points
// their phone at it: the phone joins that same demo and opens the clinic's scan page, so the scan lands in the
// dashboard they're looking at. Anything that doesn't check out opens the scan page in a demo of its own.
import { readHandoffToken } from "@/lib/dashboard/handoff";
import { joinSandbox } from "@/lib/sandbox";
import { getStore } from "@/lib/store";

export async function GET(request: Request, ctx: RouteContext<"/scan/[token]">) {
  const handoff = readHandoffToken("scan", (await ctx.params).token);
  const store = getStore();
  const [sandbox, clinic] = handoff ? await Promise.all([store.getSandbox(handoff.sandboxId), store.getClinic(handoff.subjectId)]) : [null, null];
  if (!handoff || !sandbox || !clinic) return Response.redirect(new URL("/#try", request.url), 303);
  await joinSandbox(handoff.sandboxId);
  return Response.redirect(new URL(`/c/${clinic.slug}`, request.url), 303);
}
