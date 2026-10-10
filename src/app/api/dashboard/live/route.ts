// What's new in this demo's book, for the dashboard's live notice (DECISIONS D-089, D-090): replies waiting on an
// answer, and people who just scanned themselves in, perhaps on another device. An open dashboard asks every few
// seconds while it's on screen, so either shows up without a reload. This browser's demo only.
import { newClients, waitingReplies } from "@/lib/dashboard/live";
import { readSession } from "@/lib/dashboard/session";
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
  return json({ waiting: waitingReplies(clients, messages), arrivals: newClients(clients) });
}
