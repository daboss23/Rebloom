"use client";

import { useEffect, useState } from "react";
import type { SentResults } from "@/app/c/[clinicSlug]/actions";
import { ReportGate } from "@/components/flow/ReportGate";
import { ThinkingCogs } from "@/components/flow/ThinkingCogs";
import { ButtonLink } from "@/components/ui/Button";
import { Label } from "@/components/ui/Typography";
import type { ScanView } from "@/lib/scans/service";

const STAGES = ["Reading texture", "Mapping tone", "Measuring pores and lines", "Writing your report"];

/**
 * After the analysis, the report is put together on screen for at least this long.
 * In Week 2 the Claude-written report is generated here, so this becomes a minimum rather than a pause.
 */
const ASSEMBLE_MS = 8000;
/** What "Writing your report" works through, about two seconds each. All of it is in the report. */
const ASSEMBLE_STEPS = [
  "Comparing your 15 measurements",
  "Choosing your three priorities",
  "Mapping them on your photo",
  "Writing your report",
];

export function ProcessingView({
  scanId,
  clinicSlug,
  clinicName,
  contact,
}: {
  scanId: string;
  clinicSlug: string;
  clinicName: string;
  /** Present once the client has opted in at the gate (for example, on a reload afterwards). */
  contact: Omit<SentResults, "reportPath"> | null;
}) {
  const [view, setView] = useState<ScanView | null>(null);
  const [connectionIssue, setConnectionIssue] = useState(false);
  const [assembleStep, setAssembleStep] = useState(0);

  useEffect(() => {
    let stopped = false;
    let timer = 0;
    let delay = 2000;
    async function poll() {
      try {
        const res = await fetch(`/api/scans/${scanId}/status`, { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const next = (await res.json()) as ScanView;
        if (stopped) return;
        setView(next);
        setConnectionIssue(false);
        if (next.status === "complete" || next.status === "failed") return;
      } catch {
        if (!stopped) setConnectionIssue(true);
      }
      // Back off gently: 2s, 3s, 4.5s, capped at 5s (DECISIONS D-019).
      delay = Math.min(5000, delay * 1.5);
      timer = window.setTimeout(poll, delay);
    }
    void poll();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, [scanId]);

  const complete = view?.status === "complete";
  // Every report still behind the gate is put together on screen first, however quickly the analysis
  // finished. A client who has already opted in goes straight to their confirmation.
  const locked = complete && Boolean(view.locked);
  const assembling = locked && assembleStep < ASSEMBLE_STEPS.length;

  // Walk through the report-writing steps, then open the gate.
  useEffect(() => {
    if (!locked) return;
    const each = ASSEMBLE_MS / ASSEMBLE_STEPS.length;
    const timers = ASSEMBLE_STEPS.map((_, i) => window.setTimeout(() => setAssembleStep(i + 1), each * (i + 1)));
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [locked]);

  if (complete && !assembling) {
    const sent: SentResults | null = view.reportPath && contact ? { ...contact, reportPath: view.reportPath } : null;
    return <ReportGate clinicSlug={clinicSlug} clinicName={clinicName} scanId={scanId} demo={view.demo} sent={sent} />;
  }

  if (view?.status === "failed" && view.error) {
    return (
      <div className="focus-in pt-12">
        <Label>Your scan</Label>
        <h1 className="t-h2 mt-4">{view.error.title}</h1>
        <p className="t-body mt-4">{view.error.instruction}</p>
        <ButtonLink href={`/c/${clinicSlug}/capture`} block className="mt-10 !min-h-14 text-[16px]">
          Take a new photo
        </ButtonLink>
      </div>
    );
  }

  const current = assembling ? STAGES.length - 1 : (view?.stageIndex ?? 0);
  return (
    <div className="pt-10 pb-8" role="status" aria-live="polite">
      <span className="glass grid h-[112px] w-[112px] place-items-center !rounded-[28px]">
        <ThinkingCogs className="h-auto w-[78px]" />
      </span>
      <div className="mt-6">
        <Label>Your scan</Label>
      </div>
      <h1 className="t-h1 mt-4">{assembling ? "Putting your report together." : "Reading your photo."}</h1>
      <p className="t-body mt-5">
        {assembling
          ? "Almost there. We're turning 15 measurements into your personal skin report."
          : "This usually takes under a minute. Please keep this page open."}
      </p>
      <ol className="glass mt-8 divide-y divide-[#0c1a22]/[0.07] px-5">
        {STAGES.map((stage, i) => {
          const state = i < current ? "done" : i === current ? "active" : "waiting";
          return (
            <li key={stage} className="py-5">
              <div className="flex items-center gap-4">
                <span
                  aria-hidden
                  className={`block h-[11px] w-[11px] shrink-0 rounded-full transition-colors duration-500 ${
                    state === "done"
                      ? "bg-[var(--growth)]"
                      : state === "active"
                        ? "border-2 border-[#1e5a78] bg-white"
                        : "border border-[#0c1a22]/20"
                  }`}
                  style={state === "active" ? { animation: "breathe 2.4s ease-in-out infinite" } : undefined}
                />
                <span className={state === "waiting" ? "text-text-3" : "text-ink"}>{stage}</span>
                <span className="sr-only">{state === "done" ? "done" : state === "active" ? "in progress" : "waiting"}</span>
              </div>
              {assembling && state === "active" && (
                <p key={assembleStep} className="fade t-caption mt-2 pl-[27px]">
                  {ASSEMBLE_STEPS[Math.min(assembleStep, ASSEMBLE_STEPS.length - 1)]}
                </p>
              )}
            </li>
          );
        })}
      </ol>
      {connectionIssue && <p className="t-caption mt-6">Reconnecting. Your scan is safe.</p>}
    </div>
  );
}
