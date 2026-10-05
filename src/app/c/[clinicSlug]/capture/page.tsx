import { CaptureFlow } from "@/components/capture/CaptureFlow";
import { loadFlow, requireStep } from "@/lib/flow/load";

export default async function CapturePage({ params }: PageProps<"/c/[clinicSlug]/capture">) {
  const { clinicSlug } = await params;
  const state = await loadFlow(clinicSlug);
  requireStep(state, "capture");
  return <CaptureFlow clinicSlug={clinicSlug} />;
}
