// Who is waiting on an answer, for the dashboard's live notice (DECISIONS D-089). An open dashboard asks every few
// seconds while it's on screen, so a reply that lands by webhook shows up without a reload. This browser's demo only.
import { readSession } from "@/lib/dashboard/session";
import { waitingReplies } from "@/lib/dashboard/replies";
import { json } from "@/lib/scans/access";
import { getStore } from "@/lib/store";

export async function GET() {
  const session = await readSession();
  if (!session) return json({ error: "Please sign in again." }, 401);
  const store = getStore();
  const [clients, messages] = await Promise.all([
    store.listClients(session.clinic.id, session.sandboxId),
    store.listMessages(session.clinic.id, session.sandboxId),
  ]);
  return json({ waiting: waitingReplies(clients, messages) });
}
