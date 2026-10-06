import Link from "next/link";
import { ButtonLink } from "@/components/ui/Button";
import { IconArrowRight } from "@/components/ui/Icons";
import { Label } from "@/components/ui/Typography";
import { ClinicWordmark, RebloomWordmark } from "@/components/ui/Wordmarks";
import { SEED_CLINICS } from "@/data/clinics";
import { clinicThemeStyle } from "@/lib/brand";

const LOOP = [
  ["The scan", "A calm, clinic-branded scan page turns a website visitor into a booked consult with a personal skin report."],
  ["The brief", "Before the client walks in, the practitioner sees their face map, lowest scores, goals and flags to review."],
  ["The proof", "Progress scans between sessions, taken under the same verified conditions, measure real change."],
  ["The moment", "Measured improvement becomes the rebooking moment: one more session gets you to your goal."],
  ["The catch", "Stalled progress or a missed scan flags the client as at risk, before they quietly leave."],
  ["The outcome", "The owner sees revenue retained, not just leads captured."],
] as const;

export default function RebloomHome() {
  return (
    <div className="min-h-dvh flex flex-col">
      <header className="border-b border-mist">
        <div className="mx-auto max-w-5xl px-5 h-16 flex items-center justify-between">
          <RebloomWordmark />
          <span className="t-label">For skin clinics</span>
        </div>
      </header>

      <main className="flex-1">
        <section className="mx-auto max-w-5xl px-5 pt-16 pb-20 sm:pt-24">
          <Label>The retention engine for skin clinics</Label>
          <h1 className="t-h1 mt-5 max-w-3xl sm:!text-[64px] sm:!leading-[1.04] reveal">
            Everyone sells the scan. Rebloom sells the second visit.
          </h1>
          <p className="t-body mt-6 max-w-xl">
            Skin clinics run on courses of treatment, yet most clients stop after one session. Rebloom turns a skin scan
            into measured proof that treatment is working, and turns that proof into the next booking.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row gap-3 max-w-xl">
            <ButtonLink href="#try" className="sm:flex-1">
              Try the client experience
            </ButtonLink>
            <ButtonLink href="/dashboard/enter" variant="secondary" className="sm:flex-1">
              Enter the clinic dashboard
            </ButtonLink>
          </div>
        </section>

        <section id="try" className="mx-auto max-w-5xl px-5 pb-20 scroll-mt-8">
          <Label>Try it as a client</Label>
          <h2 className="t-h2 mt-3">One platform, each clinic&apos;s own brand.</h2>
          <p className="t-body mt-3 max-w-xl">
            Pick a demo clinic. Clients only ever see the clinic&apos;s name, colors and voice.
          </p>
          <ul className="mt-8 grid sm:grid-cols-2 gap-4">
            {SEED_CLINICS.map((clinic) => (
              <li key={clinic.id} style={clinicThemeStyle(clinic.accentHex)} className="flex">
                <Link
                  href={`/c/${clinic.slug}`}
                  className="group flex flex-col w-full border border-mist hover:border-ink transition-colors duration-300 p-6"
                >
                  <span aria-hidden className="block h-[2px] w-12 bg-accent mb-8" />
                  <ClinicWordmark clinic={clinic} />
                  <p className="t-caption mt-4">
                    {clinic.city} · Demo clinic
                  </p>
                  <p className="mt-auto pt-8 inline-flex items-center gap-2 text-[15px] text-ink">
                    Start a scan <IconArrowRight width={18} height={18} className="transition-transform duration-300 group-hover:translate-x-1" />
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <section className="bg-ink on-dark">
          <div className="mx-auto max-w-5xl px-5 py-20">
            <p className="t-label !text-ink-soft">The loop</p>
            <h2 className="font-display font-light text-[34px] leading-tight text-porcelain mt-3 max-w-2xl">
              The report is the retention engine.
            </h2>
            <ol className="mt-12 grid sm:grid-cols-2 lg:grid-cols-3 gap-x-10">
              {LOOP.map(([title, body], i) => (
                <li key={title} className="border-t border-white/15 py-6">
                  <p className="t-label !text-ink-soft">{String(i + 1).padStart(2, "0")}</p>
                  <h3 className="mt-2 text-[17px] text-porcelain">{title}</h3>
                  <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">{body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-5 py-20 grid sm:grid-cols-2 gap-10">
          <div>
            <Label>Measured honestly</Label>
            <h2 className="t-h2 mt-3">Progress on the raw data, not the flattering number.</h2>
          </div>
          <p className="t-body">
            Skin analysis comes from Perfect Corp&apos;s YouCam API. Clients see YouCam&apos;s friendly scores, but every
            progress claim and rebooking trigger runs on the underlying raw measurement, and only when both scans passed
            the same capture checks.
          </p>
        </section>
      </main>

      <footer className="border-t border-mist">
        <div className="mx-auto max-w-5xl px-5 py-8 flex flex-wrap gap-4 justify-between t-caption">
          <span>Rebloom · A demo built for the YouCam API Skin AI hackathon</span>
          <nav className="flex gap-5">
            <Link href="/privacy" className="underline underline-offset-4">Privacy</Link>
            <Link href="/terms" className="underline underline-offset-4">Terms</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
