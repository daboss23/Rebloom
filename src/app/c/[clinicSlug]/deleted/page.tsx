import { ButtonLink } from "@/components/ui/Button";
import { Label } from "@/components/ui/Typography";
import { loadClinic } from "@/lib/flow/load";

export default async function DeletedPage({ params }: PageProps<"/c/[clinicSlug]/deleted">) {
  const clinic = await loadClinic((await params).clinicSlug);
  return (
    <div className="focus-in pt-12">
      <Label>Your data</Label>
      <h1 className="t-h1 mt-4">Deleted.</h1>
      <p className="t-body mt-5">
        Your photos, scores, answers and contact details have been removed from {clinic.name}. Your old report link no
        longer works.
      </p>
      <ButtonLink href={`/c/${clinic.slug}`} variant="secondary" block className="mt-10">
        Back to {clinic.name}
      </ButtonLink>
    </div>
  );
}
