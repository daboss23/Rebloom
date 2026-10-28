// The morning run's drafts, for Today to follow while the agent works (DECISIONS D-097). This demo's only.
import { draftView } from "@/lib/agent/view";
import { readSession } from "@/lib/dashboard/session";
import { json } from "@/lib/scans/access";
import { getStore } from "@/lib/store";

/** Enough for a morning's book. */
const MAX_IDS = 24;

export async function GET(request: Request) {
  const session = await readSession();
  if (!session) return json({ error: "Please sign in again." }, 401);
  const ids = new Set((new URL(request.url).searchParams.get("ids") ?? "").split(",").filter(Boolean).slice(0, MAX_IDS));
  if (ids.size === 0) return json({ drafts: [] });
  const drafts = await getStore()
    .listAgentDrafts(session.clinic.id, session.sandboxId)
    .catch(() => []);
  return json({ drafts: drafts.filter((d) => ids.has(d.id)).map(draftView) });
}
