"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ThinkingCogs } from "@/components/flow/ThinkingCogs";
import { ButtonLink } from "@/components/ui/Button";
import { Label } from "@/components/ui/Typography";
import type { ScanView } from "@/lib/scans/service";

const STAGES = ["Reading texture", "Mapping tone", "Measuring pores and lines", "Comparing with your first scan"];

/** Reads a progress scan, then opens the report, which now leads with what's changed (DECISIONS D-073). */
export function RescanProcessing({ token, scanId }: { token: string; scanId: string }) {
  const router = useRouter();
  const [view, setView] = useState<ScanView | null>(null);
  const [connectionIssue, setConnectionIssue] = useState(false);

  useEffect(() => {
    let stopped = false;
    let timer = 0;
    let delay = 2000;
    async function poll() {
      try {
        const res = await fetch(`/api/scans/${scanId}/status?report=${encodeURIComponent(token)}`, { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const next = (await res.json()) as ScanView;
        if (stopped) return;
        setView(next);
        setConnectionIssue(false);
        if (next.status === "complete") {
          router.replace(`/r/${token}`);
          return;
        }
        if (next.status === "failed") return;
      } catch {
        if (!stopped) setConnectionIssue(true);
      }
      // Back off gently, as the first scan does (DECISIONS D-019).
      delay = Math.min(5000, delay * 1.5);
      timer = window.setTimeout(poll, delay);
    }
    void poll();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, [router, scanId, token]);

  if (view?.status === "failed" && view.error) {
    return (
      <div className="focus-in pt-12">
        <Label>Progress scan</Label>
        <h1 className="t-h2 mt-4">{view.error.title}</h1>
        <p className="t-body mt-4">{view.error.instruction}</p>
        <ButtonLink href={`/r/${token}/rescan`} block className="mt-10 !min-h-14 text-[16px]">
          Take a new photo
        </ButtonLink>
      </div>
    );
  }

  const complete = view?.status === "complete";
  const current = complete ? STAGES.length - 1 : Math.min(view?.stageIndex ?? 0, STAGES.length - 1);
  return (
    <div className="pt-10 pb-8" role="status" aria-live="polite">
      <span className="glass grid h-[112px] w-[112px] place-items-center !rounded-[28px]">
        <ThinkingCogs className="h-auto w-[78px]" />
      </span>
      <div className="mt-6">
        <Label>Progress scan</Label>
      </div>
      <h1 className="t-h1 mt-4">{complete ? "Opening your progress." : "Reading your photo."}</h1>
      <p className="t-body mt-5">This usually takes under a minute. Please keep this page open.</p>
      <ol className="glass mt-8 divide-y divide-[#0c1a22]/[0.07] px-5">
        {STAGES.map((stage, i) => {
          const state = complete || i < current ? "done" : i === current ? "active" : "waiting";
          return (
            <li key={stage} className="flex items-center gap-4 py-5">
              <span
                aria-hidden
                className={`block h-[11px] w-[11px] shrink-0 rounded-full transition-colors duration-500 ${
                  state === "done" ? "bg-[var(--growth)]" : state === "active" ? "border-2 border-[#1e5a78] bg-white" : "border border-[#0c1a22]/20"
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
