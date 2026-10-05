import { ConsentForm } from "@/components/flow/ConsentForm";
import { Label } from "@/components/ui/Typography";
import { IconLock } from "@/components/ui/Icons";
import { hasBiometricConsent, loadFlow } from "@/lib/flow/load";
import { redirect } from "next/navigation";

export default async function ConsentPage({ params }: PageProps<"/c/[clinicSlug]/consent">) {
  const { clinicSlug } = await params;
  const state = await loadFlow(clinicSlug);
  if (state.client && hasBiometricConsent(state)) redirect(`/c/${clinicSlug}/intake`);
  const { clinic } = state;

  const sections: [string, string][] = [
    [
      "What we analyze",
      "One photo of your face. AI skin analysis measures visible features like texture, tone, pores and redness. It doesn't identify who you are.",
    ],
    [
      "What we keep",
      "Your photo, the analysis results, and your answers to a few short questions, including routine pre-treatment questions such as pregnancy or recent medication.",
    ],
    [
      "For how long",
      "Until you delete it, or 12 months after your last visit, whichever comes first. This is a demo, so everything is deleted after 30 days.",
    ],
    [
      "Who sees it",
      `You, and ${clinic.name}'s practitioners. Our analysis partner, Perfect Corp's YouCam API, processes the photo to measure it and keeps it for no longer than 24 hours. Nothing is ever sold or used for advertising.`,
    ],
    ["How to delete it", "Your report has a Delete my data link. One tap removes your photo and personal details."],
  ];

  return (
    <div className="pt-10 reveal">
      <Label>Before we begin</Label>
      <h1 className="t-h1 mt-4">Your photo, your choice.</h1>
      <p className="t-body mt-5">Here is exactly what happens to your photo, in plain words.</p>

      <dl className="mt-10 border-t border-mist">
        {sections.map(([term, detail]) => (
          <div key={term} className="py-5 border-b border-mist">
            <dt className="t-h3">{term}</dt>
            <dd className="t-body mt-1">{detail}</dd>
          </div>
        ))}
      </dl>

      <p className="t-caption mt-6 flex items-center gap-2">
        <IconLock width={16} height={16} /> Stored privately. Shown only through short-lived secure links.
      </p>

      <ConsentForm clinicSlug={clinic.slug} clinicName={clinic.name} />
    </div>
  );
}
