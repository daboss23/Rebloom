"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { FaceScan } from "@/components/flow/FaceScan";
import { ButtonLink } from "@/components/ui/Button";
import { Label } from "@/components/ui/Typography";
import { dropShot, readShot, type Shot } from "@/lib/capture/handoff";
import type { ScanView } from "@/lib/scans/service";

const STAGES = ["Reading texture", "Mapping tone", "Measuring pores and lines", "Comparing with your first scan"];

/** Reads a progress scan, then opens the report, which now leads with what's changed (DECISIONS D-073). */
export function RescanProcessing({ token, scanId }: { token: string; scanId: string }) {
  const router = useRouter();
  const [view, setView] = useState<ScanView | null>(null);
  const [connectionIssue, setConnectionIssue] = useState(false);
  // The photo just taken, from this tab (D-077), scanned while it's read.
  const [shot, setShot] = useState<Shot | null>(null);
  useEffect(() => {
    const t = window.setTimeout(() => setShot(readShot(scanId)), 0);
    return () => window.clearTimeout(t);
  }, [scanId]);

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
          dropShot(scanId);
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
    <div className="pt-6 pb-8">
      <FaceScan
        photo={shot?.photo ?? null}
        points={shot?.points ?? null}
        stage={STAGES[current]}
        step={current + 1}
        steps={STAGES.length}
        progress={complete ? 1 : (current + 0.5) / STAGES.length}
        done={complete}
      />
      <div className="mt-8" role="status" aria-live="polite">
        <Label>Progress scan</Label>
        <h1 className="t-h1 mt-4">{complete ? "Opening your progress." : "Reading your photo."}</h1>
        <p className="t-body mt-5">This usually takes under a minute. Please keep this page open.</p>
        <p className="sr-only">{STAGES[current]}</p>
      </div>
      {connectionIssue && <p className="t-caption mt-6">Reconnecting. Your scan is safe.</p>}
    </div>
  );
}
