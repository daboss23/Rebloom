import { ButtonLink } from "@/components/ui/Button";
import { Hairline, Label } from "@/components/ui/Typography";
import { loadClinic } from "@/lib/flow/load";

const PROMISES = [
  ["Your three priorities", "Not fifteen numbers. The three things worth your attention, in plain words."],
  ["A plan with real prices", "Built only from our treatment menu, mapped to dates, with every price upfront."],
  ["Private, and yours to delete", "One private link. Delete your photo and details whenever you like."],
] as const;

export default async function ScanStartPage({ params }: PageProps<"/c/[clinicSlug]">) {
  const clinic = await loadClinic((await params).clinicSlug);
  return (
    <div className="pt-12 pb-4 reveal">
      {clinic.lockupUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- static brand lockup
        <img src={clinic.lockupUrl} alt={clinic.name} width={240} height={110} className="mx-auto mb-14 w-[220px] h-auto" />
      )}
      <span aria-hidden className="block h-[2px] w-12 bg-accent mb-5" />
      <Label>
        {clinic.name} · {clinic.city}
      </Label>
      <h1 className="t-h1 mt-4">See your skin clearly.</h1>
      <p className="t-body mt-5 max-w-[30rem]">
        A short photo scan, read by AI skin analysis and reviewed by our practitioners. You&apos;ll get a private
        report that shows what we see, and where we&apos;d begin.
      </p>

      <ButtonLink href={`/c/${clinic.slug}/consent`} block className="mt-10">
        Begin
      </ButtonLink>
      <p className="t-caption mt-4 text-center">About three minutes · Free · No account needed</p>

      <ul className="mt-16">
        {PROMISES.map(([title, body], i) => (
          <li key={title}>
            <Hairline />
            <div className="py-6 grid grid-cols-[2.25rem_1fr] gap-x-3">
              <span className="t-label pt-[3px]">{String(i + 1).padStart(2, "0")}</span>
              <div>
                <h2 className="t-h3">{title}</h2>
                <p className="t-body mt-1">{body}</p>
              </div>
            </div>
          </li>
        ))}
      </ul>
      <Hairline />
    </div>
  );
}
