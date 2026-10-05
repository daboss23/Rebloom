import { redirect } from "next/navigation";
import { ProcessingView } from "@/components/flow/ProcessingView";
import { loadFlow } from "@/lib/flow/load";
import { REPORT_EMAIL_LIVE } from "@/lib/report/load";
import { getOwnScan } from "@/lib/scans/access";

export default async function ProcessingPage({ params, searchParams }: PageProps<"/c/[clinicSlug]/processing">) {
  const { clinicSlug } = await params;
  const scanId = (await searchParams).scan;
  const state = await loadFlow(clinicSlug);
  const scan = typeof scanId === "string" ? await getOwnScan(scanId) : null;
  if (!scan || !state.client || scan.clientId !== state.client.id) redirect(`/c/${clinicSlug}`);
  const { firstName, email } = state.client;
  return (
    <ProcessingView
      scanId={scan.id}
      clinicSlug={clinicSlug}
      clinicName={state.clinic.name}
      contact={firstName && email ? { firstName, email, emailed: REPORT_EMAIL_LIVE } : null}
    />
  );
}
