import { IntakeFlow } from "@/components/flow/IntakeFlow";
import { isoDateInZone } from "@/lib/clock";
import { loadFlow, requireStep } from "@/lib/flow/load";
import { sandboxNow } from "@/lib/sandbox";

export default async function IntakePage({ params }: PageProps<"/c/[clinicSlug]/intake">) {
  const { clinicSlug } = await params;
  const state = await loadFlow(clinicSlug);
  requireStep(state, "intake");
  const today = isoDateInZone(await sandboxNow(), state.clinic.timezone);
  const { intake, client } = state;

  return (
    <IntakeFlow
      clinicSlug={clinicSlug}
      today={today}
      initial={{
        concerns: intake?.concerns ?? [],
        concernsOther: intake?.concernsOther ?? "",
        goalText: intake?.goalText ?? "",
        hasEvent: intake?.hasEvent ?? null,
        eventType: intake?.eventType ?? null,
        eventDate: intake?.eventDate ?? "",
        pastTreatments: intake?.pastTreatments ?? [],
        budgetBand: intake?.budgetBand ?? null,
        screening: intake?.screening ?? {},
        sensitivitiesNote: intake?.sensitivitiesNote ?? "",
        ageRange: client.ageRange ?? null,
      }}
    />
  );
}
