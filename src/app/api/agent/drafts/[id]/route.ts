// One of the agent's drafts, for the brief to follow while it's being written (DECISIONS D-093). This demo's only.
import { draftView } from "@/lib/agent/view";
import { readSession } from "@/lib/dashboard/session";
import { json } from "@/lib/scans/access";
import { getStore } from "@/lib/store";

export async function GET(_request: Request, { params }: RouteContext<"/api/agent/drafts/[id]">) {
  const session = await readSession();
  if (!session) return json({ error: "Please sign in again." }, 401);
  const { id } = await params;
  const draft = await getStore()
    .getAgentDraft(id)
    .catch(() => null);
  if (!draft || draft.sandboxId !== session.sandboxId || draft.clinicId !== session.clinic.id) return json({ error: "Not found." }, 404);
  return json(draftView(draft));
}
