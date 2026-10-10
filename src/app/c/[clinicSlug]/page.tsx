import { ButtonLink } from "@/components/ui/Button";
import { IconArrowRight, IconCheckCircle, IconLock } from "@/components/ui/Icons";
import { inProgress, loadFlow } from "@/lib/flow/load";
import { startOver } from "./actions";

const PROMISES = [
  ["Your three priorities", "Not fifteen numbers. The three things worth your attention, in plain words.", <IconCheckCircle key="p" width={18} height={18} />],
  ["A plan with real prices", "Built only from our treatment menu, mapped to dates, with every price upfront.", <span key="m" className="gold-foil font-display text-[1.5rem] leading-none">$</span>],
  ["Private, and yours to delete", "One private link. Delete your photo and details whenever you like.", <IconLock key="l" width={18} height={18} />],
] as const;

export default async function ScanStartPage({ params }: PageProps<"/c/[clinicSlug]">) {
  const state = await loadFlow((await params).clinicSlug);
  const { clinic } = state;
  // Someone who began and left part way: offer to carry on, never drop them mid-questionnaire unannounced.
  const resume = inProgress(state);
  return (
    <div className="pb-4 pt-10">
      {clinic.lockupUrl && (
        // eslint-disable-next-line @next/next/no-img-element -- static brand lockup
        <img src={clinic.lockupUrl} alt={clinic.name} width={240} height={110} className="focus-in mx-auto mb-12 h-auto w-[200px]" />
      )}
      <p className="focus-in flex items-center gap-3 text-[0.6875rem] uppercase tracking-[0.22em] text-[#1e5a78]" style={{ animationDelay: "60ms" }}>
        <span aria-hidden className="block h-[2px] w-8 rounded-full bg-accent" />
        {clinic.name} · {clinic.city}
      </p>
      <h1 className="t-h1 focus-in mt-5" style={{ animationDelay: "120ms" }}>
        See your skin clearly.
      </h1>
      <p className="focus-in mt-5 max-w-[30rem] text-[1.03125rem] leading-relaxed text-text-2" style={{ animationDelay: "180ms" }}>
        A short photo scan, read by AI skin analysis and reviewed by our practitioners. You&apos;ll get a private report
        that shows what we see, and where we&apos;d begin.
      </p>

      <div className="focus-in mt-10" style={{ animationDelay: "240ms" }}>
        <ButtonLink href={`/c/${clinic.slug}/consent`} block className="group !min-h-14 text-[1rem]">
          {resume ? "Pick up where you left off" : "Begin"}
          <IconArrowRight width={18} height={18} aria-hidden className="transition-transform duration-300 ease-out group-hover:translate-x-1" />
        </ButtonLink>
        {resume ? (
          <form action={startOver.bind(null, clinic.slug)} className="mt-4 text-center">
            <p className="t-caption">
              Welcome back. Your answers so far are saved.{" "}
              <button type="submit" className="text-ink underline decoration-[#0c1a22]/25 underline-offset-4 hover:decoration-ink">
                Start over
              </button>
            </p>
          </form>
        ) : (
          <p className="t-caption mt-4 text-center">About three minutes · Free · No account needed</p>
        )}
      </div>

      <ul className="mt-14 space-y-3">
        {PROMISES.map(([title, body, mark], i) => (
          <li key={title} className="glass focus-in flex gap-4 px-5 py-5" style={{ animationDelay: `${320 + i * 90}ms` }}>
            <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-[12px] bg-white/80 text-[#1e5a78] ring-1 ring-inset ring-white">
              {mark}
            </span>
            <div>
              <h2 className="font-display text-[1.375rem] font-light leading-snug text-ink">{title}</h2>
              <p className="t-body mt-1">{body}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
