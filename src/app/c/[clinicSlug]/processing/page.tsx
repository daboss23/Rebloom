import { redirect } from "next/navigation";
import { ProcessingView } from "@/components/flow/ProcessingView";
import { loadFlow } from "@/lib/flow/load";
import { reportDelivery } from "@/lib/email/report";
import { getOwnScan } from "@/lib/scans/access";

export default async function ProcessingPage({ params, searchParams }: PageProps<"/c/[clinicSlug]/processing">) {
  const { clinicSlug } = await params;
  const scanId = (await searchParams).scan;
  const state = await loadFlow(clinicSlug);
  const scan = typeof scanId === "string" ? await getOwnScan(scanId) : null;
  if (!scan || !state.client || scan.clientId !== state.client.id) redirect(`/c/${clinicSlug}`);
  const { firstName, email, id, sandboxId } = state.client;
  // Back after opting in: the confirmation says what really happened to the email.
  const delivery = firstName && email ? await reportDelivery(state.clinic.id, id, sandboxId, scan.id) : "off";
  return (
    <ProcessingView
      scanId={scan.id}
      clinicSlug={clinicSlug}
      clinicName={state.clinic.name}
      contact={firstName && email ? { firstName, email, delivery } : null}
    />
  );
}
