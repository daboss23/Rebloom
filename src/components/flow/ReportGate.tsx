"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { unlockReport, type SentResults, type UnlockResult } from "@/app/c/[clinicSlug]/actions";
import { Bloom } from "@/components/dashboard/Bloom";
import { LightField } from "@/components/dashboard/LightField";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Checkbox, FieldLabel, TextInput } from "@/components/ui/Field";
import { FormAlert } from "@/components/ui/FormAlert";
import { TEXTS_CONSENT } from "@/lib/flow/consent";
import { IconLock } from "@/components/ui/Icons";
import { Label, ScoreNumber } from "@/components/ui/Typography";
import { ScoreRuler } from "@/components/ui/ScoreRuler";

// Placeholder content for the blurred report: the shape of a real report, with made-up words and
// numbers. The client's real scores stay on the server until they opt in (brief 3.1 step 6).
const GHOST_PRIORITIES = [
  { label: "Texture", score: 58, line: "Where we'd begin, and the area most likely to show change first." },
  { label: "Pigmentation", score: 63, line: "Darker patches across the cheeks that respond well to a short course." },
  { label: "Pores", score: 69, line: "Most visible around the nose, and closely linked to texture." },
];
const GHOST_ANALYSIS = [
  ["Redness", 74],
  ["Moisture", 72],
  ["Radiance", 70],
  ["Firmness", 82],
  ["Wrinkles", 85],
  ["Dark circles", 68],
] as const;

/** How long the report sits visibly blurred before the panel arrives over it. */
const PANEL_DELAY_MS = 700;

export function ReportGate({
  clinicSlug,
  clinicName,
  scanId,
  demo,
  sent: alreadySent = null,
}: {
  clinicSlug: string;
  clinicName: string;
  scanId: string;
  demo: boolean;
  /** Set when the client opted in on an earlier visit to this page. */
  sent?: SentResults | null;
}) {
  const [state, action, pending] = useActionState<UnlockResult | null, FormData>(
    unlockReport.bind(null, clinicSlug, scanId),
    null,
  );
  const sent = state?.sent ?? alreadySent;
  const [open, setOpen] = useState(Boolean(alreadySent));
  const overlay = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) return;
    const timer = window.setTimeout(() => setOpen(true), PANEL_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [open]);

  // The panel is the only thing to do here: keep the page behind it still, and move focus to it
  // (the panel, not a field, so phones don't throw up the keyboard over the message).
  useEffect(() => {
    if (!open) return;
    overlay.current?.scrollTo({ top: 0 });
    dialog.current?.focus({ preventScroll: true });
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  useEffect(() => {
    if (!sent) return;
    overlay.current?.scrollTo({ top: 0 });
    dialog.current?.focus({ preventScroll: true });
  }, [sent]);

  // A field the server turned back takes focus, so it can be corrected straight away.
  useEffect(() => {
    if (state?.field) document.getElementById(state.field)?.focus();
  }, [state]);

  // The panel is modal: Tab cycles through it, never out to the page dimmed behind it.
  function keepFocusInside(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "Tab" || !dialog.current) return;
    const focusable = [...dialog.current.querySelectorAll<HTMLElement>("a[href], button:not([disabled]), input:not([disabled])")];
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === dialog.current)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  }
  const invalid = (field: NonNullable<UnlockResult["field"]>) =>
    state?.field === field ? { "aria-invalid": true, "aria-describedby": "gate-error" } : {};

  return (
    <div className="relative pt-10 pb-8">
      <BlurredReport scanId={scanId} />

      {open && (
        <div ref={overlay} className="fade fixed inset-0 z-40 overflow-y-auto bg-[#0c1a22]/35">
          {/* A sheet from the bottom on phones, so the blurred report still shows above it. */}
          <div className="flex min-h-full items-end justify-center px-3 pb-3 pt-8 sm:items-center sm:p-6">
            <div
              ref={dialog}
              role="dialog"
              aria-modal="true"
              aria-labelledby="gate-title"
              tabIndex={-1}
              onKeyDown={keepFocusInside}
              className="rise w-full max-w-[440px] overflow-hidden rounded-[28px] bg-[#f4f8fa] shadow-[0_40px_90px_-30px_rgba(12,26,34,0.7)] outline-none ring-1 ring-white/80"
            >
              {sent ? (
                <div className="px-6 pb-7 pt-7">
                  <Confirmation sent={sent} clinicName={clinicName} demo={demo} />
                </div>
              ) : (
                <>
                  {/* The moment the report is ready: deep sea and moving light, as when the dashboard sends. */}
                  <header className="sea on-dark relative overflow-hidden px-6 pb-7 pt-6">
                    <LightField variant="sea" className="opacity-70" />
                    <div className="relative">
                      <p className="flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-[#e2c07a]">
                        <IconLock width={15} height={15} aria-hidden />
                        Analysis complete
                      </p>
                      <h1 id="gate-title" className="mt-3 font-display text-[36px] font-light leading-[1.04] tracking-[-0.01em] text-white">
                        Your skin report is ready.
                      </h1>
                      <p className="mt-2 text-[15px] leading-relaxed text-[#dbe8ef]">Tell us where to send your results.</p>
                    </div>
                  </header>
                  <form action={action} className="space-y-4 px-6 pb-6 pt-6">
                    <div>
                      <FieldLabel htmlFor="firstName">First name</FieldLabel>
                      <TextInput id="firstName" name="firstName" autoComplete="given-name" maxLength={60} required defaultValue={state?.values?.firstName} {...invalid("firstName")} />
                    </div>
                    <div>
                      <FieldLabel htmlFor="email">Email</FieldLabel>
                      <TextInput
                        id="email"
                        name="email"
                        type="email"
                        inputMode="email"
                        autoComplete="email"
                        required
                        defaultValue={state?.values?.email}
                        {...invalid("email")}
                      />
                    </div>
                    <div>
                      <FieldLabel htmlFor="phone" optional>
                        Phone
                      </FieldLabel>
                      <TextInput id="phone" name="phone" type="tel" autoComplete="tel" maxLength={30} defaultValue={state?.values?.phone} {...invalid("phone")} />
                    </div>
                    <Checkbox id="reminders" name="reminders" defaultChecked={state?.values?.reminders}>
                      Remind me when it&apos;s time for a progress scan.
                    </Checkbox>
                    {/* Its own box, unticked, as US texting rules expect (D-080). */}
                    <Checkbox id="texts" name="texts" defaultChecked={state?.values?.texts}>
                      {TEXTS_CONSENT.ask(clinicName)}
                      <span className="t-caption mt-1 block">{TEXTS_CONSENT.terms}</span>
                    </Checkbox>

                    {state?.error && <FormAlert id="gate-error">{state.error}</FormAlert>}

                    <Button type="submit" block disabled={pending} className="!min-h-14 text-[16px]">
                      {pending ? "Sending your results" : "Send my results"}
                    </Button>
                    <p className="t-caption text-center">Private to you. No spam. Delete your data at any time.</p>
                  </form>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Confirmation({ sent, clinicName, demo }: { sent: SentResults; clinicName: string; demo: boolean }) {
  const emailed = sent.delivery === "sent";
  return (
    <div className="fade" role="status">
      <span aria-hidden className="grid h-14 w-14 place-items-center rounded-full bg-[radial-gradient(circle_at_30%_30%,#fff_0%,#ffe4d8_55%,#f4b9a3_100%)] shadow-[0_14px_30px_-16px_rgba(158,74,93,0.6)] ring-1 ring-white">
        <Bloom size={30} unfurl className="text-[#9e4a5d]" />
      </span>
      <div className="mt-6">
        <Label className="!text-[#1e5a78]">{emailed ? "Results sent" : "All done"}</Label>
      </div>
      <h1 id="gate-title" className="t-h2 mt-3">
        {emailed ? `${sent.firstName}, your results are on their way.` : `${sent.firstName}, your report is ready.`}
      </h1>
      {emailed ? (
        <p className="t-body mt-4">
          We&apos;ve sent your skin report to <span className="text-ink [overflow-wrap:anywhere]">{sent.email}</span>, with a private
          link that&apos;s yours to keep. Come back to it after every visit to see your progress.
        </p>
      ) : (
        <p className="t-body mt-4">
          Your skin report is saved to a private link that&apos;s yours to keep. Come back to it after every visit to see
          your progress.
        </p>
      )}
      <p className="t-body mt-4">Thank you for completing your skin consultation with {clinicName}.</p>

      {emailed ? (
        <p className="t-caption mt-8">
          Nothing in your inbox after a few minutes? Check your spam folder, or{" "}
          <Link href={sent.reportPath} className="text-ink underline decoration-[#0c1a22]/30 underline-offset-4 hover:decoration-ink">
            open your report here
          </Link>
          .
        </p>
      ) : (
        <>
          <ButtonLink href={sent.reportPath} block className="mt-8 !min-h-14 text-[16px]">
            Open my report
          </ButtonLink>
          <p className="t-caption mt-4 text-center">
            {sent.delivery === "off"
              ? `Demo: email isn't connected yet, so nothing was sent to ${sent.email}.`
              : `We couldn't email your report to ${sent.email}, so open it here and bookmark the page.`}
          </p>
        </>
      )}
      {demo && <p className="t-caption mt-2 text-center">Demo analysis: results are sample data.</p>}
    </div>
  );
}

/** The report, already written, sitting just out of focus behind the panel. */
function BlurredReport({ scanId }: { scanId: string }) {
  return (
    <div aria-hidden inert className="reveal pointer-events-none select-none blur-[6px]">
      <Label>Your skin report</Label>
      <p className="t-h1 mt-4">Your skin is telling a clear story.</p>
      <p className="t-body mt-4">
        Here&apos;s what we see, and where we&apos;d begin. Three areas stand out, and all three respond well to a
        focused plan over the coming weeks.
      </p>
      {/* eslint-disable-next-line @next/next/no-img-element -- server-blurred, private, never cached */}
      <img src={`/api/scans/${scanId}/preview`} alt="" className="mt-8 aspect-[3/4] w-full rounded-[24px] bg-mist object-cover" />

      <div className="glass mt-8 flex items-end justify-between px-5 py-5">
        <div>
          <Label>Overall</Label>
          <p className="t-h3 mt-2">Balanced, with room to glow</p>
        </div>
        <ScoreNumber value={72} />
      </div>

      <p className="t-h2 mt-12">Your three priorities</p>
      <ol className="mt-6 space-y-3">
        {GHOST_PRIORITIES.map((row, i) => (
          <li key={row.label} className="glass px-5 py-5">
            <p className="t-label">{String(i + 1).padStart(2, "0")}</p>
            <div className="flex items-end justify-between gap-4">
              <p className="pb-2 font-display text-[26px] font-light text-ink">{row.label}</p>
              <ScoreNumber value={row.score} />
            </div>
            <ScoreRuler value={row.score} className="mt-3" />
            <p className="t-body mt-4">{row.line}</p>
          </li>
        ))}
      </ol>

      <p className="t-h3 mt-10">Full analysis</p>
      <dl className="glass mt-4 grid grid-cols-2 gap-x-6 px-5 pb-2">
        {GHOST_ANALYSIS.map(([label, score]) => (
          <div key={label} className="flex items-baseline justify-between border-t border-[#0c1a22]/[0.07] py-3 first:border-t-0 [&:nth-child(2)]:border-t-0">
            <dt className="text-[14px] text-text-2">{label}</dt>
            <dd className="font-display text-[26px] font-light leading-none text-ink">{score}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
