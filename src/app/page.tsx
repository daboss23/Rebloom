import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { Bloom } from "@/components/dashboard/Bloom";
import { CountUp } from "@/components/dashboard/CountUp";
import { KindChip, Monogram } from "@/components/dashboard/Kind";
import { LightField } from "@/components/dashboard/LightField";
import { Calculator } from "@/components/landing/Calculator";
import { MiniBars } from "@/components/landing/MiniBars";
import { ScoreLine } from "@/components/landing/ScoreLine";
import { cx } from "@/components/ui/cx";
import { IconArrowRight, IconCheckCircle, IconMail, IconPlus } from "@/components/ui/Icons";
import { ClinicWordmark, RebloomWordmark } from "@/components/ui/Wordmarks";
import { MAISON_VERRE, SEED_CLINICS } from "@/data/clinics";
import { clinicThemeStyle } from "@/lib/brand";
import { landingPreview, type LandingPreview, type PreviewRow } from "@/lib/landing/preview";
import { formatPrice } from "@/lib/plan/build";
import { SCORED_CONCERNS } from "@/lib/skin/concerns";

/*
 * Direction (DECISIONS D-059).
 * THESIS: the landing page is the dashboard's morning, live. It refuses the category's screenshot and feature
 * grid: the first thing a visitor sees is the real rebook queue, computed by the engine from the demo clinic.
 * OWN-WORLD: the dashboard's (D-058). Caustic light on ice, frosted glass, deep sea, gold only for money,
 * green only for measured change, the bloom only for a progress moment. Cormorant light, Inter.
 * STORY: a clinic owner or judge sees what Rebloom does at a glance, feels what one-and-done costs, trusts
 * the honest mechanism, does the arithmetic on their own clinic, and enters the demo.
 * FIRST VIEWPORT: full-bleed light; the positioning line across two lines at display scale, "the second visit"
 * in gold; the promise and the gold "Enter the clinic dashboard" on the left; the live queue on the right.
 * FORM: a direct-response page in the dashboard's grammar: proof, problem, mechanism, honesty, arithmetic,
 * white label, objections, close.
 */

export const metadata: Metadata = {
  description:
    "Rebloom turns every skin scan into measured proof that treatment is working, then tells your clinic who to rebook today, and why.",
};

// The preview follows the demo calendar, so it's rebuilt through the day rather than frozen at build time.
export const revalidate = 3600;

const wrap = "mx-auto w-full max-w-[1280px] px-5 sm:px-10";
const sectionTitle = "font-display text-[clamp(40px,5vw,68px)] font-light leading-[1.02] tracking-[-0.02em] text-ink [text-wrap:balance]";
const enter = "/dashboard/enter";

export default function RebloomHome() {
  const p = landingPreview();
  return (
    <div className="rebloom landing relative min-h-dvh overflow-x-clip">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-[10px] focus:bg-ink focus:px-4 focus:py-2 focus:text-white"
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-40 border-b border-white/70 bg-white/60 backdrop-blur-xl backdrop-saturate-150">
        <div className={`${wrap} flex h-16 items-center justify-between gap-4 sm:gap-6 lg:h-[72px]`}>
          <Link href="/" aria-label="Rebloom home" className="shrink-0">
            <RebloomWordmark height={18} className="!h-4 sm:!h-[18px]" />
          </Link>
          <nav aria-label="On this page" className="hidden lg:block">
            <ul className="flex items-center gap-9 text-[14px] text-text-2">
              {[
                ["#how", "How it works"],
                ["#numbers", "The numbers"],
                ["#questions", "Questions"],
              ].map(([href, label]) => (
                <li key={href}>
                  <a href={href} className="transition-colors duration-200 hover:text-ink">
                    {label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <Link href={enter} className="btn-gold !hidden !h-9 whitespace-nowrap px-3.5 text-[13px] min-[390px]:!inline-flex sm:!h-10 sm:px-4 sm:text-[13.5px]">
            Enter the clinic dashboard
          </Link>
        </div>
      </header>

      <main id="main" tabIndex={-1}>
        <Hero p={p} />
        <Problem p={p} />
        <How p={p} />
        <Honest />
        <Numbers p={p} />
        <Try />
        <Questions />
        <Close />
      </main>

      <footer className="border-t border-[#0c1a22]/[0.08]">
        <div className={`${wrap} flex flex-col gap-5 py-10 sm:flex-row sm:items-center sm:justify-between`}>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
            <RebloomWordmark height={15} />
            <span className="text-[13px] text-text-3">A demo built for the YouCam API Skin AI hackathon.</span>
          </div>
          <nav aria-label="Legal">
            <ul className="flex gap-6 text-[13px] text-text-3">
              <li>
                <Link href="/privacy" className="underline decoration-[#0c1a22]/20 underline-offset-4 hover:text-ink hover:decoration-ink">
                  Privacy
                </Link>
              </li>
              <li>
                <Link href="/terms" className="underline decoration-[#0c1a22]/20 underline-offset-4 hover:text-ink hover:decoration-ink">
                  Terms
                </Link>
              </li>
            </ul>
          </nav>
        </div>
      </footer>
    </div>
  );
}

/* ---------- The first viewport: the promise, and the product keeping it ---------- */

function Hero({ p }: { p: LandingPreview }) {
  const shown = p.rows.slice(0, 3);
  const more = p.rows.length - shown.length;
  const date = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" }).format(
    new Date(`${p.today}T12:00:00Z`),
  );
  const figures = [
    { value: p.rows.length, words: p.rows.length === 1 ? "person to contact" : "people to contact", gold: false },
    { value: p.visitsToday, words: p.visitsToday === 1 ? "visit today" : "visits today", gold: false },
    { value: Math.round(p.readyCents / 100), words: "ready to rebook", gold: true },
  ];

  return (
    <section aria-labelledby="hero-title" className="relative">
      {/* The light runs up behind the glass bar and fades into the page below. */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 -top-16 bottom-0 [mask-image:linear-gradient(180deg,#000_0%,#000_70%,transparent_100%)] lg:-top-[72px]">
        <LightField variant="ice" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_75%_55%_at_22%_28%,rgba(246,251,253,0.82)_0%,rgba(246,251,253,0.35)_60%,rgba(246,251,253,0)_100%)]" />
      </div>

      <div className={`${wrap} relative pb-24 pt-12 sm:pt-16 lg:pb-32 lg:pt-20`}>
        <p className="focus-in flex items-center gap-2.5 text-[11px] uppercase tracking-[0.22em] text-[#1e5a78]">
          <Bloom size={16} unfurl className="text-[#9e4a5d]" />
          The retention engine for skin clinics
        </p>
        <h1
          id="hero-title"
          className="focus-in mt-6 font-display text-[clamp(44px,6.5vw,96px)] font-light leading-[1] tracking-[-0.025em] text-ink [text-wrap:balance]"
          style={{ animationDelay: "80ms" }}
        >
          <span className="block">Everyone sells the scan.</span>{" "}
          <span className="block">
            Rebloom sells <span className="gold-foil">the second visit.</span>
          </span>
        </h1>

        <div className="mt-10 grid gap-14 lg:mt-14 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] lg:gap-16 xl:gap-20">
          <div className="focus-in" style={{ animationDelay: "180ms" }}>
            <p className="max-w-[31rem] text-[18px] leading-relaxed text-text-2 sm:text-[19px]">
              Rebloom turns every skin scan into measured proof that treatment is working, then tells your team who to
              rebook today.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <Link href={enter} className="btn-gold group !h-14 gap-2.5 px-6 text-[15.5px]">
                Enter the clinic dashboard
                <IconArrowRight width={18} height={18} className="transition-transform duration-300 ease-out group-hover:translate-x-1" />
              </Link>
              <a href="#try" className="btn-ghost !h-14 px-6 text-[15px]">
                Try the client experience
              </a>
            </div>
          </div>

          <section aria-labelledby="today-title" className="min-w-0">
            <div className="focus-in flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1" style={{ animationDelay: "240ms" }}>
              <h2 id="today-title" className="font-display text-[28px] font-light leading-tight text-ink sm:text-[32px]">
                Who to contact, and why
              </h2>
              <p className="text-[12.5px] text-text-3">{date}</p>
            </div>
            <ul className="focus-in mt-4 grid grid-cols-3 gap-px overflow-hidden rounded-[18px] bg-white/60 ring-1 ring-white/80 backdrop-blur-xl" style={{ animationDelay: "300ms" }}>
              {figures.map((f, i) => (
                <li key={f.words} className="bg-white/45 px-4 py-4 sm:px-5">
                  <span className={cx("block font-display text-[clamp(32px,3.4vw,44px)] font-light leading-none tracking-[-0.02em]", f.gold ? "gold-foil" : "text-ink")}>
                    <CountUp value={f.value} format={f.gold ? "money" : "int"} delay={500 + i * 120} />
                  </span>
                  <span className="mt-2 block text-[12.5px] leading-snug text-text-2 sm:text-[13.5px]">{f.words}</span>
                </li>
              ))}
            </ul>
            <ol className="mt-3 space-y-3">
              {shown.map((row, i) => (
                <QueuePreviewRow key={row.name} row={row} delay={380 + i * 90} />
              ))}
            </ol>
            <p className="focus-in mt-5 text-[13px] leading-relaxed text-text-3" style={{ animationDelay: "700ms" }}>
              {more > 0 && `${more} more in the queue. `}Twelve sample clients at {p.clinicName}, run through the same engine as
              the dashboard.
            </p>
          </section>
        </div>
      </div>
    </section>
  );
}

/** A queue row as the dashboard shows it, without the actions: who, why, and what booking back in is worth. */
function QueuePreviewRow({ row, delay }: { row: PreviewRow; delay: number }) {
  return (
    <li
      style={{ animationDelay: `${delay}ms` }}
      className={cx(
        "glass grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-3 p-4 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:p-5",
        row.kind === "progress_moment" ? "moment !border-[#f4b9a3]/60" : "focus-in",
      )}
    >
      <Monogram row={row} className="!h-12 !w-12 !rounded-[14px] !text-[18px]" />
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <span className="font-display text-[22px] leading-tight text-ink">{row.name}</span>
          <KindChip row={row} />
        </p>
        <p className="mt-1.5 text-[14.5px] leading-relaxed text-text-2">{row.reason}</p>
      </div>
      {row.valueCents ? (
        <div className="col-start-2 flex items-baseline gap-2 sm:col-start-auto sm:block sm:text-right">
          <p className="gold-foil font-display text-[28px] font-light leading-none">{formatPrice(row.valueCents)}</p>
          <p className="t-caption !text-[12px] sm:mt-1.5">{row.valueNote}</p>
        </div>
      ) : (
        <span className="hidden sm:block" />
      )}
    </li>
  );
}

/* ---------- The problem, in the clinic's own currency ---------- */

function Problem({ p }: { p: LandingPreview }) {
  const { course } = p;
  const total = course.priceCents * course.sessions;
  const lost = total - course.priceCents;
  // One session: a row on phones, a tile from small screens up.
  const tile = "flex h-16 items-center justify-between rounded-[14px] px-4 sm:h-32 sm:flex-col sm:items-start sm:p-4";
  return (
    <section aria-labelledby="problem-title" className={wrap}>
      <div className="sea on-dark relative overflow-clip rounded-[32px] px-6 py-14 shadow-[0_40px_80px_-44px_rgba(12,26,34,0.65)] sm:px-12 sm:py-16 lg:px-16 lg:py-20">
        <LightField variant="sea" className="opacity-55" />
        <div className="relative grid gap-14 lg:grid-cols-2 lg:items-center lg:gap-20">
          <div>
            <h2 id="problem-title" className="font-display text-[clamp(40px,5vw,68px)] font-light leading-[1.02] tracking-[-0.02em] text-white">
              One session, then silence.
            </h2>
            <p className="mt-6 max-w-[33rem] text-[17px] leading-relaxed text-[#dbe8ef]">
              Peels, microneedling and light treatments are sold as courses. When clients can&apos;t see the first session
              working, they don&apos;t complain. They simply don&apos;t book the second, and it&apos;s weeks before anyone
              notices.
            </p>
            <p className="mt-4 max-w-[33rem] text-[17px] leading-relaxed text-[#dbe8ef]">
              Clinics already know clients should come back. What&apos;s missing is proof the client can see, and a
              system that notices when someone drifts.
            </p>
          </div>

          <figure>
            <figcaption className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-white/15 pb-4">
              <span className="font-display text-[24px] font-light text-white">{course.name}</span>
              <span className="text-[13.5px] text-ink-soft">
                {course.sessions} sessions at {formatPrice(course.priceCents)}
              </span>
            </figcaption>
            <ol className="mt-6 grid gap-2.5 sm:grid-cols-3 sm:gap-3">
              {Array.from({ length: course.sessions }, (_, i) =>
                i === 0 ? (
                  <li key={i} className={cx(tile, "bg-white/[0.09] ring-1 ring-inset ring-[#e2c07a]/55")}>
                    <span className="text-[11px] uppercase tracking-[0.14em] text-ink-soft">Session {i + 1}</span>
                    <span className="flex items-baseline gap-3 sm:block">
                      <span className="block text-[14px] text-white">Done</span>
                      <span className="gold-foil-bright block font-display text-[26px] leading-none sm:mt-0.5">{formatPrice(course.priceCents)}</span>
                    </span>
                  </li>
                ) : (
                  <li key={i} className="relative h-16 sm:h-32">
                    {/* Planned, then never booked: the change plays as the course scrolls into view. */}
                    <span className={cx(tile, "lapse-planned absolute inset-0 bg-white/[0.07] opacity-0 ring-1 ring-inset ring-white/25", i === 2 && "lapse-late")} aria-hidden>
                      <span className="text-[11px] uppercase tracking-[0.14em] text-ink-soft">Session {i + 1}</span>
                      <span className="flex items-baseline gap-3 sm:block">
                        <span className="block text-[14px] text-white">Planned</span>
                        <span className="block font-display text-[26px] leading-none text-white sm:mt-0.5">{formatPrice(course.priceCents)}</span>
                      </span>
                    </span>
                    <span className={cx(tile, "lapse-lost absolute inset-0 border border-dashed border-white/25", i === 2 && "lapse-late")}>
                      <span className="text-[11px] uppercase tracking-[0.14em] text-ink-soft/80">Session {i + 1}</span>
                      <span className="flex items-baseline gap-3 sm:block">
                        <span className="block text-[14px] text-ink-soft">Never booked</span>
                        <span className="block font-display text-[26px] leading-none text-ink-soft/70 sm:mt-0.5">{formatPrice(course.priceCents)}</span>
                      </span>
                    </span>
                  </li>
                ),
              )}
            </ol>
            <p className="mt-10 flex flex-wrap items-baseline gap-x-5 gap-y-2">
              <span className="gold-foil-bright font-display text-[clamp(60px,6.4vw,92px)] font-light leading-none tracking-[-0.03em]">
                {formatPrice(lost)}
              </span>
              <span className="max-w-[17rem] text-[15.5px] leading-snug text-[#dbe8ef]">
                of a {formatPrice(total)} course, gone when a client stops after session one.
              </span>
            </p>
            <p className="mt-5 text-[12.5px] text-ink-soft">Prices from the demo clinic&apos;s menu.</p>
          </figure>
        </div>
      </div>
    </section>
  );
}

/* ---------- The mechanism: five steps, each from the demo clinic ---------- */

function How({ p }: { p: LandingPreview }) {
  return (
    <section id="how" aria-labelledby="how-title" className={`${wrap} scroll-mt-24 pt-28 lg:pt-40`}>
      <h2 id="how-title" className={`${sectionTitle} max-w-3xl`}>
        From first scan to second visit.
      </h2>
      <p className="mt-5 max-w-[36rem] text-[17px] leading-relaxed text-text-2">
        Each step hands the next one a reason. By the time a client might drift, your team already knows what to say.
      </p>

      <div className="mt-14 grid gap-5 lg:grid-cols-12">
        <ScanCell />
        <ReportCell p={p} />
        <ProofCell p={p} />
        <MomentCell p={p} />
        <CatchCell p={p} />
      </div>

      <div className="mt-12 flex flex-col items-start gap-6 border-t border-[#0c1a22]/10 pt-10 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-xl font-display text-[clamp(24px,2.4vw,30px)] font-light leading-snug text-ink">
          Every example above comes from the demo clinic. See the rest of its morning.
        </p>
        <Link href={enter} className="btn-gold group !h-14 shrink-0 gap-2.5 px-6 text-[15.5px]">
          Enter the clinic dashboard
          <IconArrowRight width={18} height={18} className="transition-transform duration-300 ease-out group-hover:translate-x-1" />
        </Link>
      </div>
    </section>
  );
}

function Cell({ className, children }: { className?: string; children: ReactNode }) {
  // Clip, not hidden: a hidden overflow is a scroll container, and scroll-linked animations inside would track it instead of the page.
  return <article className={cx("relative overflow-clip rounded-[22px] p-7 sm:p-9", className)}>{children}</article>;
}

function CellTitle({ children, onDark }: { children: ReactNode; onDark?: boolean }) {
  return <h3 className={cx("font-display text-[30px] font-light leading-[1.1] sm:text-[34px]", onDark ? "text-white" : "text-ink")}>{children}</h3>;
}

function ScanCell() {
  const checks = ["One face in the frame", "Close and centered", "Looking straight ahead", "Even, bright light", "Eyes open, lips closed", "Still and in focus"];
  return (
    <Cell className="glass !rounded-[22px] lg:col-span-5">
      <CellTitle>A fair scan, every time.</CellTitle>
      <p className="mt-3 max-w-[30rem] text-[15.5px] leading-relaxed text-text-2">
        Clients scan on their phone, in your clinic&apos;s brand. A live check waits for even light and a straight-on
        face, so every rescan compares like with like.
      </p>
      <ul className="mt-7 grid gap-x-5 gap-y-3 sm:grid-cols-2">
        {checks.map((c) => (
          <li key={c} className="flex items-center gap-2.5 text-[14px] text-text-2">
            <IconCheckCircle width={18} height={18} className="shrink-0 text-[#1e5a78]" />
            {c}
          </li>
        ))}
      </ul>
      <p className="mt-7 inline-flex h-10 items-center rounded-full bg-[#0e2230] px-5 text-[13.5px] text-white shadow-[0_12px_24px_-14px_rgba(12,26,34,0.8)]">
        That&apos;s it. Hold still
      </p>
    </Cell>
  );
}

function ReportCell({ p }: { p: LandingPreview }) {
  const r = p.report;
  return (
    <Cell className="glass !rounded-[22px] lg:col-span-7">
      <div className="grid gap-8 sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div>
          <CellTitle>A report in your clinic&apos;s name.</CellTitle>
          <p className="mt-3 text-[15.5px] leading-relaxed text-text-2">
            Their own face, the three areas most likely to show change, and a plan priced from your menu. Rebloom stays
            out of sight.
          </p>
        </div>
        {r && (
          // The client's view, in the clinic's look: porcelain, ink and its accent, square corners (brief 7).
          <div style={clinicThemeStyle(MAISON_VERRE.accentHex)} className="border border-[#e6e0d6] bg-[#f7f4ef] px-6 py-6 text-[#1c1c1a] shadow-[0_24px_40px_-30px_rgba(12,26,34,0.45)]">
            <ClinicWordmark clinic={MAISON_VERRE} />
            <p className="mt-6 font-display text-[23px] font-light leading-snug">{r.firstName}, here&apos;s where we&apos;d begin.</p>
            <ul className="mt-4 divide-y divide-[#e6e0d6] border-y border-[#e6e0d6]">
              {r.priorities.map((pr) => (
                <li key={pr.label} className="flex items-baseline justify-between py-2 text-[13.5px]">
                  <span>{pr.label}</span>
                  <span className="font-display text-[20px] leading-none">{pr.score}</span>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex items-end justify-between gap-4 text-[12.5px] text-[#55524c]">
              <span>
                {r.treatments.map((t) => (
                  <span key={t.name} className="block">
                    {t.name} × {t.sessions}
                  </span>
                ))}
              </span>
              <span className="font-display text-[22px] leading-none text-[#1c1c1a]">{formatPrice(r.totalCents)}</span>
            </div>
            <span aria-hidden className="mt-5 block h-[2px] w-10 bg-accent" />
          </div>
        )}
      </div>
    </Cell>
  );
}

function ProofCell({ p }: { p: LandingPreview }) {
  const s = p.story;
  return (
    <Cell className="border border-white/80 bg-[radial-gradient(120%_70%_at_100%_0%,rgba(255,214,196,0.6)_0%,rgba(255,214,196,0)_58%),linear-gradient(180deg,#f9fcfd_0%,#e4f0f5_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.95),0_22px_44px_-26px_rgba(12,44,62,0.32)] lg:col-span-7 lg:row-span-2 lg:flex lg:flex-col">
      <CellTitle>Proof they can see.</CellTitle>
      <p className="mt-3 max-w-[36rem] text-[15.5px] leading-relaxed text-text-2">
        Progress scans between sessions show real change. Rebloom checks YouCam&apos;s raw measurement before calling
        anything progress, and only compares scans taken the same way.
      </p>
      {s && (
        <>
          <p className="mt-9 flex items-center gap-4">
            <span className="font-display text-[clamp(72px,8vw,112px)] font-light leading-[0.85] tracking-[-0.03em] text-[var(--growth)]">+{s.delta}</span>
            <span className="text-[15px] leading-snug text-text-2">
              <Bloom size={22} className="mb-2 text-[#9e4a5d]" />
              {s.label}, {s.name},
              <br />
              over {s.weeks} weeks and {s.series.length} scans
            </span>
          </p>
          {/* On wide screens the chart takes whatever height the two cells beside it give the row. */}
          <ScoreLine series={s.series} label={`${s.name}'s ${s.label.toLowerCase()}`} className="mt-6 lg:flex lg:flex-1 lg:flex-col" plotClassName="lg:min-h-60 lg:flex-1" />
        </>
      )}
      <p className="mt-6 flex items-center gap-2.5 text-[14px] text-[var(--growth)]">
        <IconCheckCircle width={18} height={18} className="shrink-0" />
        Same light, same angle. Verified at capture.
      </p>
    </Cell>
  );
}

function MomentCell({ p }: { p: LandingPreview }) {
  const m = p.moment;
  return (
    <Cell className="glass !rounded-[22px] lg:col-span-5">
      {m && (
        <div aria-hidden className="rounded-[16px] bg-white/90 p-5 shadow-[0_18px_36px_-24px_rgba(12,44,62,0.45)] ring-1 ring-[#0c1a22]/[0.06]">
          <p className="flex items-center gap-2 text-[12.5px] text-text-3">
            <IconMail width={15} height={15} />
            To {m.name}
          </p>
          <p className="mt-2 text-[15px] text-ink">{m.subject}</p>
          <div className="mt-3 space-y-2 text-[13.5px] leading-relaxed text-text-2">
            {m.paragraphs.slice(0, 2).map((para) => (
              <p key={para}>{para}</p>
            ))}
          </div>
          <div className="mt-4 flex items-center justify-between">
            <span className="text-[13px] text-text-3">{p.practitioner}</span>
            <span className="btn-gold !h-9 px-4 text-[13px]">Send email</span>
          </div>
        </div>
      )}
      <div className="mt-7">
        <CellTitle>The message, already written.</CellTitle>
        <p className="mt-3 text-[15.5px] leading-relaxed text-text-2">
          When the change is real, Rebloom drafts the note. Your practitioner reads it, edits it if they like, and
          sends. Nothing goes out on its own.
        </p>
      </div>
    </Cell>
  );
}

function CatchCell({ p }: { p: LandingPreview }) {
  const rules = [
    { label: "Stalled", rule: "Two rescans in a row with almost no change" },
    { label: "Missed", rule: "A session due, and never booked" },
    { label: "Lapsed", rule: "Months since the last visit" },
  ];
  return (
    <Cell className="sea on-dark lg:col-span-5">
      <div>
        <CellTitle onDark>Drift, caught early.</CellTitle>
        <p className="mt-3 text-[15.5px] leading-relaxed text-[#dbe8ef]">
          Each one becomes a flag with the reason in one sentence, before the client quietly leaves.
        </p>
        <ul className="mt-6 space-y-3">
          {rules.map((r) => (
            <li key={r.label} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[14px] text-[#dbe8ef]">
              <span className="inline-flex h-6 items-center gap-1.5 rounded-full bg-[#e9a35f]/15 px-2.5 text-[10.5px] uppercase tracking-[0.12em] text-[#f0bd85]">
                <span aria-hidden className="inline-block h-[7px] w-[7px] rounded-[2px] border border-[#f0bd85]" />
                {r.label}
              </span>
              {r.rule}
            </li>
          ))}
        </ul>
        <p className="mt-7 border-t border-white/10 pt-5 text-[14px] text-ink-soft">
          At the demo clinic today: <span className="font-display text-[22px] text-[#f1d49a]">{p.atRisk}</span> clients at risk,
          each with the reason.
        </p>
      </div>
    </Cell>
  );
}

/* ---------- Honesty, and the YouCam work underneath ---------- */

function Honest() {
  const apis = [
    {
      name: "AI Skin Analysis, HD",
      detail: `One photo, ${SCORED_CONCERNS.length} visible concerns, with wrinkles and pores scored by area of the face. Standard definition when a photo is too small for HD.`,
    },
    { name: "Detection masks", detail: "Each concern drawn onto the client's own photo: a face map they can tap." },
    { name: "AI Skin Simulation", detail: "An illustration of what the plan could do, labelled every time and never shown at full strength." },
  ];
  return (
    <section aria-labelledby="honest-title" className={`${wrap} pt-28 lg:pt-40`}>
      <div className="grid gap-12 lg:grid-cols-12 lg:gap-16">
        <div className="lg:col-span-6">
          <p className="text-[11px] uppercase tracking-[0.22em] text-[#1e5a78]">Built on YouCam</p>
          <h2 id="honest-title" className={`${sectionTitle} mt-5`}>
            Progress on the raw data, not the flattering number.
          </h2>
          <p className="mt-6 max-w-[34rem] text-[17px] leading-relaxed text-text-2">
            Skin analysis comes from Perfect Corp&apos;s YouCam API. Clients see YouCam&apos;s friendly display scores.
            Every progress claim and every rebook trigger runs on the raw measurement underneath, and only when both
            scans passed the same capture checks.
          </p>
        </div>
        <dl className="self-end lg:col-span-6">
          {apis.map((a) => (
            <div key={a.name} className="border-t border-[#0c1a22]/10 py-6 first:border-t-0 first:pt-0 sm:grid sm:grid-cols-[13rem_minmax(0,1fr)] sm:gap-6">
              <dt className="font-display text-[24px] font-light leading-tight text-ink">{a.name}</dt>
              <dd className="mt-2 text-[15px] leading-relaxed text-text-2 sm:mt-1">{a.detail}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

/* ---------- The arithmetic, on their numbers and on the demo's ---------- */

function Numbers({ p }: { p: LandingPreview }) {
  const first = p.months[0];
  const last = p.months[p.months.length - 1];
  return (
    <section id="numbers" aria-labelledby="numbers-title" className={`${wrap} scroll-mt-24 pt-28 lg:pt-40`}>
      <h2 id="numbers-title" className={`${sectionTitle} max-w-3xl`}>
        What one more visit is worth.
      </h2>
      <div className="mt-12 grid gap-5 lg:grid-cols-12">
        <div className="glass !rounded-[22px] p-7 sm:p-10 lg:col-span-7">
          <Calculator price={Math.round(p.course.priceCents / 100)} />
        </div>
        <div className="sea on-dark relative overflow-clip rounded-[22px] p-7 sm:p-10 lg:col-span-5">
          <LightField variant="sea" className="opacity-45" />
          <div className="relative">
            <h3 className="text-[14px] text-ink-soft">What the owner sees</h3>
            <p className="gold-foil-bright mt-4 font-display text-[clamp(56px,6vw,84px)] font-light leading-none tracking-[-0.03em]">
              {formatPrice(p.keptCents)}
            </p>
            <p className="mt-3 max-w-[22rem] text-[15px] leading-relaxed text-[#dbe8ef]">
              kept through rebooking at the demo clinic, {first.label} to {last.label}: every treatment visit after a
              client&apos;s first.
            </p>
            <div className="mt-8">
              <MiniBars months={p.months} title="Revenue kept through rebooking at the demo clinic, by month" />
            </div>
            <p className="mt-6 text-[13px] leading-relaxed text-ink-soft">
              {p.rebook.yes} of {p.rebook.of} sample clients came back after their first treatment, or are booked to.
              Gold is this month so far.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------- White label: try it as a client ---------- */

function Try() {
  return (
    <section id="try" aria-labelledby="try-title" className={`${wrap} scroll-mt-24 pt-28 lg:pt-40`}>
      <div className="grid gap-10 lg:grid-cols-12 lg:items-end lg:gap-16">
        <div className="lg:col-span-5">
          <h2 id="try-title" className={sectionTitle}>
            One platform. Each clinic&apos;s own brand.
          </h2>
          <p className="mt-6 max-w-[30rem] text-[17px] leading-relaxed text-text-2">
            Scan your face as a client of either demo clinic. Clients only ever see the clinic&apos;s name, colors and
            voice.
          </p>
        </div>
        <ul className="grid gap-5 sm:grid-cols-2 lg:col-span-7">
          {SEED_CLINICS.map((clinic) => (
            <li key={clinic.id} style={clinicThemeStyle(clinic.accentHex)} className="flex">
              <Link href={`/c/${clinic.slug}`} className="glass lift sheen group flex w-full flex-col p-2.5">
                <span className="block flex-1 border border-[#e6e0d6] bg-[#f7f4ef] px-6 pb-7 pt-6 text-[#1c1c1a]">
                  <span className="flex h-8 items-center">
                    <ClinicWordmark clinic={clinic} />
                  </span>
                  <span className="mt-12 block font-display text-[30px] font-light leading-tight">See your skin clearly.</span>
                  <span aria-hidden className="mt-5 block h-[2px] w-12 bg-accent transition-[width] duration-500 ease-out group-hover:w-20" />
                </span>
                <span className="flex items-center justify-between gap-4 px-3.5 pb-2 pt-4">
                  <span className="text-[13px] text-text-3">{clinic.city}</span>
                  <span className="inline-flex items-center gap-2 whitespace-nowrap text-[14.5px] text-ink">
                    Start a scan
                    <IconArrowRight width={17} height={17} className="transition-transform duration-300 ease-out group-hover:translate-x-1" />
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* ---------- Objections, answered plainly ---------- */

function Questions() {
  const faqs: [string, string][] = [
    [
      "Can I try it without signing up?",
      "Yes. Enter the clinic dashboard and your browser gets its own copy of the demo clinic: twelve sample clients, laid out around today. Send, confirm and move the clock forward as freely as you like.",
    ],
    [
      "How does it decide who to contact?",
      "With plain rules you can read: real change since the first scan, two rescans without change, a session due and not booked, a report with nothing booked, a course finished, or a long silence. Each person appears once, with the reason in one sentence.",
    ],
    [
      "Does anything go out on its own?",
      "No. Rebloom writes the draft. Your practitioner reads it, edits it if they like, and presses Send. In the demo, sent messages land in an on-screen outbox, never a real inbox.",
    ],
    [
      "Will clients see Rebloom?",
      "Barely. The scan and the report carry your clinic's name, colors and voice, with a small Powered by Rebloom line at the foot of the page. Emails are signed by your practitioner.",
    ],
    [
      "What happens to client photos?",
      "Nothing without consent. Clients agree before the camera opens. Photos stay in private storage, open only through the client's own report link, and are deleted when the client asks.",
    ],
    [
      "Is Rebloom a medical tool?",
      "No. Rebloom reads the visible appearance of skin, for cosmetic purposes only. It's not a medical diagnosis, and it's not a guaranteed result.",
    ],
    [
      "Does it connect to our booking system?",
      "Not yet. Connections to the booking systems clinics already use are planned, and the demo's Settings page lists them. For now, clients book by calling or replying to their email.",
    ],
  ];
  return (
    <section id="questions" aria-labelledby="questions-title" className={`${wrap} scroll-mt-24 pt-28 lg:pt-40`}>
      <div className="grid gap-10 lg:grid-cols-12 lg:gap-16">
        <h2 id="questions-title" className={`${sectionTitle} self-start lg:sticky lg:top-28 lg:col-span-4`}>
          Questions, in plain English.
        </h2>
        <div className="glass !rounded-[22px] px-6 sm:px-9 lg:col-span-8">
          {faqs.map(([q, a]) => (
            <details key={q} className="faq group border-t border-[#0c1a22]/[0.08] first:border-t-0">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-6 font-display text-[22px] leading-snug text-ink sm:text-[24px] [&::-webkit-details-marker]:hidden">
                {q}
                <IconPlus width={20} height={20} className="shrink-0 text-text-3 transition-transform duration-300 ease-out group-open:rotate-45" />
              </summary>
              <p className="faq-answer max-w-[60ch] pb-7 text-[15.5px] leading-relaxed text-text-2">{a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ---------- The close ---------- */

function Close() {
  return (
    <section aria-labelledby="close-title" className={`${wrap} pb-16 pt-28 lg:pb-24 lg:pt-40`}>
      <div className="sea on-dark relative overflow-hidden rounded-[32px] px-6 py-20 text-center shadow-[0_40px_80px_-44px_rgba(12,26,34,0.65)] sm:px-12 lg:py-28">
        <LightField variant="sea" className="opacity-75" />
        <div className="relative mx-auto max-w-3xl">
          <Bloom size={30} className="mx-auto text-[#f1d49a]" />
          <h2 id="close-title" className="mt-7 font-display text-[clamp(40px,5.2vw,72px)] font-light leading-[1.02] tracking-[-0.02em] text-white [text-wrap:balance]">
            Your next bookings are already in your client list.
          </h2>
          <p className="mx-auto mt-6 max-w-xl text-[17px] leading-relaxed text-[#dbe8ef]">
            No sign-up. Open the demo and see who Rebloom would have your team contact this morning, and why.
          </p>
          <div className="mt-10 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
            <Link href={enter} className="btn-gold group !h-14 gap-2.5 px-7 text-[15.5px]">
              Enter the clinic dashboard
              <IconArrowRight width={18} height={18} className="transition-transform duration-300 ease-out group-hover:translate-x-1" />
            </Link>
            <a
              href="#try"
              className="inline-flex h-14 items-center justify-center rounded-[12px] border border-white/25 px-7 text-[15px] text-white transition-[background-color,border-color,transform] duration-200 hover:border-white/45 hover:bg-white/10 active:scale-[0.97]"
            >
              Try the client experience
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
