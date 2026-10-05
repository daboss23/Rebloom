import { loadReportData, reportPlan } from "@/lib/report/load";
import { advanceSimulation } from "@/lib/simulation/service";

// Starting a simulation uploads the photo to YouCam; finishing one copies the result.
export const maxDuration = 60;

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "cache-control": "no-store", "x-robots-tag": "noindex" } });

/** One step of the report's "what to expect" simulation, for the latest scan only. */
export async function GET(_request: Request, ctx: RouteContext<"/r/[token]/simulation/[scanId]">) {
  const { token, scanId } = await ctx.params;
  const data = await loadReportData(token);
  if (!data || data.latest.id !== scanId) return json({ error: "Not found" }, 404);
  const planned = await reportPlan(token);
  if (!planned) return json({ error: "Not found" }, 404);
  return json(await advanceSimulation(data.report, data.latest, planned.plan));
}
