"use client";

import { useEffect, useState } from "react";
import { ReportGate } from "@/components/flow/ReportGate";
import { ButtonLink } from "@/components/ui/Button";
import { IconCheckCircle, IconCopy } from "@/components/ui/Icons";
import { Label } from "@/components/ui/Typography";
import type { ScanView } from "@/lib/scans/service";

const STAGES = ["Reading texture", "Mapping tone", "Measuring pores and lines", "Writing your report"];

export function ProcessingView({
  scanId,
  clinicSlug,
  firstName,
}: {
  scanId: string;
  clinicSlug: string;
  firstName: string;
}) {
  const [view, setView] = useState<ScanView | null>(null);
  const [connectionIssue, setConnectionIssue] = useState(false);

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

  if (view?.status === "complete" && view.locked) {
    return <ReportGate clinicSlug={clinicSlug} scanId={scanId} demo={view.demo} />;
  }

  if (view?.status === "complete" && view.reportPath) {
    return <Ready reportPath={view.reportPath} firstName={firstName} demo={view.demo} />;
  }

  if (view?.status === "failed" && view.error) {
    return (
      <div className="pt-12 reveal">
        <Label>Your scan</Label>
        <h1 className="t-h2 mt-4">{view.error.title}</h1>
        <p className="t-body mt-4">{view.error.instruction}</p>
        <ButtonLink href={`/c/${clinicSlug}/capture`} block className="mt-10">
          Take a new photo
        </ButtonLink>
      </div>
    );
  }

  const current = view?.stageIndex ?? 0;
  return (
    <div className="pt-12 pb-8" role="status" aria-live="polite">
      <Label>Your scan</Label>
      <h1 className="t-h1 mt-4">{firstName ? `Thank you, ${firstName}.` : "Thank you."}</h1>
      <p className="t-body mt-5">
        We&apos;re reading your photo now. This usually takes under a minute. Please keep this page open.
      </p>
      <ol className="mt-12 border-t border-mist">
        {STAGES.map((stage, i) => {
          const state = i < current ? "done" : i === current ? "active" : "waiting";
          return (
            <li key={stage} className="flex items-center gap-4 py-5 border-b border-mist">
              <span
                aria-hidden
                className={`block h-[9px] w-[9px] rounded-full border ${
                  state === "done" ? "bg-accent border-accent" : state === "active" ? "border-ink" : "border-mist"
                }`}
                style={state === "active" ? { animation: "breathe 2.4s ease-in-out infinite" } : undefined}
              />
              <span className={state === "waiting" ? "text-text-3" : "text-ink"}>{stage}</span>
              <span className="sr-only">{state === "done" ? "done" : state === "active" ? "in progress" : "waiting"}</span>
            </li>
          );
        })}
      </ol>
      {connectionIssue && <p className="t-caption mt-6">Reconnecting. Your scan is safe.</p>}
    </div>
  );
}

function Ready({ reportPath, firstName, demo }: { reportPath: string; firstName: string; demo: boolean }) {
  const [copied, setCopied] = useState(false);
  const [origin, setOrigin] = useState("");
  // eslint-disable-next-line react-hooks/set-state-in-effect -- the origin only exists in the browser
  useEffect(() => setOrigin(window.location.origin), []);
  const url = `${origin}${reportPath}`;

  return (
    <div className="pt-12 reveal">
      <IconCheckCircle width={28} height={28} className="text-bronze" />
      <h1 className="t-h1 mt-6">{firstName ? `${firstName}, your report is ready.` : "Your report is ready."}</h1>
      <p className="t-body mt-5">
        This is your private link. Keep it somewhere safe: it&apos;s how you&apos;ll see your progress after each scan.
      </p>
      <div className="mt-8 border border-mist">
        <p className="px-4 pt-4 t-label">Your private link</p>
        <p className="px-4 pt-2 pb-4 text-[14px] text-ink break-all">{url}</p>
        <button
          type="button"
          onClick={async () => {
            await navigator.clipboard?.writeText(url).catch(() => undefined);
            setCopied(true);
          }}
          className="w-full min-h-12 border-t border-mist flex items-center justify-center gap-2 text-[14px] text-ink hover:bg-ink/[0.03]"
        >
          <IconCopy width={16} height={16} /> {copied ? "Link copied" : "Copy link"}
        </button>
      </div>
      {demo && (
        <p className="t-caption mt-4">This scan used demo analysis, so the results are sample data rather than a reading of your photo.</p>
      )}
      <ButtonLink href={reportPath} block className="mt-8">
        Open your report
      </ButtonLink>
    </div>
  );
}
