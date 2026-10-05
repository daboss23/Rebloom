"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import { unlockReport, type SentResults, type UnlockResult } from "@/app/c/[clinicSlug]/actions";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Checkbox, FieldLabel, TextInput } from "@/components/ui/Field";
import { IconCheckCircle, IconLock } from "@/components/ui/Icons";
import { Label, ScoreBar, ScoreNumber } from "@/components/ui/Typography";

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

  return (
    <div className="relative pt-10 pb-8">
      <BlurredReport scanId={scanId} />

      {open && (
        <div ref={overlay} className="fixed inset-0 z-40 overflow-y-auto bg-ink/40 fade">
          {/* A sheet from the bottom on phones, so the blurred report still shows above it. */}
          <div className="min-h-full flex items-end sm:items-center justify-center px-3 pt-8 pb-3 sm:p-6">
            <div
              ref={dialog}
              role="dialog"
              aria-modal="true"
              aria-labelledby="gate-title"
              tabIndex={-1}
              className="rise w-full max-w-[440px] bg-porcelain shadow-[0_30px_80px_-20px_rgba(0,0,0,0.55)] outline-none"
            >
              <div className="h-[3px] bg-accent" />
              <div className="px-6 pt-6 pb-6">
                {sent ? (
                  <Confirmation sent={sent} clinicName={clinicName} demo={demo} />
                ) : (
                  <form action={action} className="space-y-4">
                    <div className="flex items-center gap-2 text-text-2">
                      <IconLock width={16} height={16} />
                      <Label>Analysis complete</Label>
                    </div>
                    <h1 id="gate-title" className="t-h2">
                      Your skin report is ready.
                    </h1>
                    <p className="t-body !mt-2">Tell us where to send your results.</p>
                    <div>
                      <FieldLabel htmlFor="firstName">First name</FieldLabel>
                      <TextInput id="firstName" name="firstName" autoComplete="given-name" maxLength={60} required />
                    </div>
                    <div>
                      <FieldLabel htmlFor="email">Email</FieldLabel>
                      <TextInput id="email" name="email" type="email" inputMode="email" autoComplete="email" required />
                    </div>
                    <div>
                      <FieldLabel htmlFor="phone" optional>
                        Phone
                      </FieldLabel>
                      <TextInput id="phone" name="phone" type="tel" autoComplete="tel" maxLength={30} />
                    </div>
                    <Checkbox id="reminders" name="reminders">
                      Remind me when it&apos;s time for a progress scan.
                    </Checkbox>

                    {state?.error && (
                      <p role="alert" className="text-[14px] text-ink border-l border-bronze pl-3">
                        {state.error}
                      </p>
                    )}

                    <Button type="submit" block disabled={pending}>
                      {pending ? "Sending your results" : "Send my results"}
                    </Button>
                    <p className="t-caption text-center">Private to you. No spam. Delete your data at any time.</p>
                  </form>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Confirmation({ sent, clinicName, demo }: { sent: SentResults; clinicName: string; demo: boolean }) {
  return (
    <div className="fade" role="status">
      <IconCheckCircle width={30} height={30} className="text-bronze" />
      <div className="mt-5">
        <Label>{sent.emailed ? "Results sent" : "All done"}</Label>
      </div>
      <h1 id="gate-title" className="t-h2 mt-3">
        {sent.emailed ? `${sent.firstName}, your results are on their way.` : `${sent.firstName}, your report is ready.`}
      </h1>
      {sent.emailed ? (
        <p className="t-body mt-4">
          We&apos;ve sent your skin report to <span className="text-ink break-all">{sent.email}</span>, with a private
          link that&apos;s yours to keep. Come back to it after every visit to see your progress.
        </p>
      ) : (
        <p className="t-body mt-4">
          Your skin report is saved to a private link that&apos;s yours to keep. Come back to it after every visit to see
          your progress.
        </p>
      )}
      <p className="t-body mt-4">Thank you for completing your skin consultation with {clinicName}.</p>

      {sent.emailed ? (
        <p className="t-caption mt-8">
          Nothing in your inbox after a few minutes? Check your spam folder, or{" "}
          <Link href={sent.reportPath} className="text-ink underline underline-offset-4">
            open your report here
          </Link>
          .
        </p>
      ) : (
        <>
          <ButtonLink href={sent.reportPath} variant="secondary" block className="mt-8">
            Open my report
          </ButtonLink>
          <p className="t-caption mt-4 text-center">
            Demo: email isn&apos;t connected yet, so nothing was sent to {sent.email}.
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
    <div aria-hidden inert className="pointer-events-none select-none blur-[6px] reveal">
      <Label>Your skin report</Label>
      <p className="t-h1 mt-4">Your skin is telling a clear story.</p>
      <p className="t-body mt-4">
        Here&apos;s what we see, and where we&apos;d begin. Three areas stand out, and all three respond well to a
        focused plan over the coming weeks.
      </p>
      {/* eslint-disable-next-line @next/next/no-img-element -- server-blurred, private, never cached */}
      <img src={`/api/scans/${scanId}/preview`} alt="" className="mt-8 w-full aspect-[3/4] object-cover bg-mist" />

      <div className="mt-10 flex items-end justify-between border-y border-mist py-6">
        <div>
          <Label>Overall</Label>
          <p className="t-h3 mt-2">Balanced, with room to glow</p>
        </div>
        <ScoreNumber value={72} />
      </div>

      <p className="t-h2 mt-12">Your three priorities</p>
      <ol className="mt-6">
        {GHOST_PRIORITIES.map((row, i) => (
          <li key={row.label} className="border-t border-mist py-6">
            <p className="t-label">{String(i + 1).padStart(2, "0")}</p>
            <div className="flex items-end justify-between gap-4">
              <p className="t-h3 pb-2">{row.label}</p>
              <ScoreNumber value={row.score} />
            </div>
            <ScoreBar value={row.score} className="mt-3" />
            <p className="t-body mt-4">{row.line}</p>
          </li>
        ))}
      </ol>

      <p className="t-h3 mt-10">Full analysis</p>
      <dl className="mt-4 grid grid-cols-2 gap-x-6">
        {GHOST_ANALYSIS.map(([label, score]) => (
          <div key={label} className="flex items-baseline justify-between border-t border-mist py-3">
            <dt className="text-[14px] text-text-2">{label}</dt>
            <dd className="font-display text-[26px] font-light text-ink leading-none">{score}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
