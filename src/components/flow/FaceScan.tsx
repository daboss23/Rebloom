"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { ScanLight } from "@/components/face/ScanLight";
import { ScanShow } from "@/components/face/ScanShow";
import { cx } from "@/components/ui/cx";
import { framing, onStage, photoBox } from "@/lib/face/frame";
import { FACE_POINT_COUNT, canonicalFace, type Pt } from "@/lib/face/grid";

const REST = { oval: 0.52, features: 0.42 };

/**
 * The scan, on the client's own face, while their photo is read (DECISIONS D-077, D-092). A fine grid that follows
 * the face's 3D shape sweeps across it while the scan plays its acts around the face (ScanShow): lock-on, contour,
 * texture, tone and lines, with glass cards that come and go. Focus brackets hold the face and a ruler tracks the
 * sweep; the bar is the analysis's real progress and every figure is true. Once the reading ends, the report's
 * steps take over. Without the photo (another tab, private mode) it scans the face model itself. With reduced
 * motion it holds still.
 */
export function FaceScan({
  photo,
  points,
  stage,
  step,
  steps,
  progress,
  done,
  report,
}: {
  /** The photo just taken, or null to scan the face model instead. */
  photo: string | null;
  points: Pt[] | null;
  /** What the analysis is doing now, in a few words. */
  stage: string;
  step: number;
  steps: number;
  /** The analysis's real progress, 0 to 1. */
  progress: number;
  done: boolean;
  /** While the report is put together: its steps, and how many are done. */
  report?: { steps: string[]; at: number };
}) {
  const own = Boolean(photo && points && points.length >= FACE_POINT_COUNT);
  // The face model's own points: the scan is drawn on them, never on anything invented.
  const face = useMemo<Pt[]>(() => (own ? points!.slice(0, FACE_POINT_COUNT) : canonicalFace()), [own, points]);
  const [aspect, setAspect] = useState(0.75);
  const plane = useMemo(() => framing(face, own ? aspect : 0.75), [face, own, aspect]);
  const box = useMemo(() => bounds(face.map((p) => onStage(p, plane))), [face, plane]);
  const marker = useRef<HTMLSpanElement>(null);

  // The ruler's marker follows the sweep, set directly so the page doesn't re-render each frame.
  const onFront = useCallback((front: number) => {
    if (marker.current) marker.current.style.transform = `translateX(${(front * 100).toFixed(2)}%)`;
  }, []);

  const pct = (n: number) => `${(n * 100).toFixed(2)}%`;
  const pad = 0.05;

  return (
    <div className="relative mx-auto w-full max-w-[460px]">
      <div
        className={cx(
          "relative aspect-[4/5] overflow-hidden rounded-[28px] shadow-[0_40px_80px_-40px_rgba(12,44,62,0.7)] ring-1 ring-white/80",
          own ? "bg-mist" : "bg-[radial-gradient(90%_70%_at_50%_42%,#1e5a78_0%,#0e2230_70%,#081820_100%)]",
        )}
      >
        <ScanShow points={face} frame={plane} photo={own ? photo : null} phase={done ? "report" : "scan"} face="your face" report={report}>
          {own && (
            // eslint-disable-next-line @next/next/no-img-element -- the photo just taken, from this tab only
            <img
              src={photo!}
              alt=""
              onLoad={(e) => setAspect(e.currentTarget.naturalWidth / e.currentTarget.naturalHeight || 0.75)}
              className="absolute max-w-none object-cover"
              style={photoBox(plane)}
            />
          )}
          {/* Cool light over the photo while it's read, so the scan carries. */}
          {own && <div aria-hidden className="absolute inset-0 bg-[linear-gradient(180deg,rgba(206,236,248,0.18),rgba(12,44,62,0.18))]" />}

          <ScanLight points={face} frame={plane} passes={Infinity} settled={done} rest={REST} onFront={onFront} />
        </ScanShow>

        {/* Focus brackets: they close on the face as it's found. */}
        <div
          aria-hidden
          className="scan-brackets pointer-events-none absolute"
          style={{ left: pct(box.left - pad), top: pct(box.top - pad * 0.8), width: pct(box.right - box.left + pad * 2), height: pct(box.bottom - box.top + pad * 1.6) }}
        >
          {["left-0 top-0 border-l border-t rounded-tl-[10px]", "right-0 top-0 border-r border-t rounded-tr-[10px]", "bottom-0 left-0 border-b border-l rounded-bl-[10px]", "bottom-0 right-0 border-b border-r rounded-br-[10px]"].map((c) => (
            <span key={c} className={cx("absolute h-5 w-5 border-white/95 drop-shadow-[0_0_4px_rgba(120,210,255,0.9)]", c)} />
          ))}
        </div>

        {/* Bottom: a ruler that tracks the sweep, and the analysis's real progress. */}
        <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-[linear-gradient(180deg,rgba(8,24,32,0)_0%,rgba(8,24,32,0.5)_100%)]" />
        <div aria-hidden className="pointer-events-none absolute bottom-[3.3rem] h-3" style={{ left: pct(box.left), width: pct(box.right - box.left) }}>
          <svg viewBox="0 0 100 10" preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible">
            {Array.from({ length: 41 }, (_, i) => (
              <line key={i} x1={i * 2.5} x2={i * 2.5} y1={i % 4 === 0 ? 0 : 5} y2={10} stroke="rgba(255,255,255,0.7)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
            ))}
          </svg>
          <span ref={marker} className="absolute inset-y-0 left-0 w-full will-change-transform">
            <span className="absolute -top-1.5 bottom-0 w-[2px] -translate-x-1/2 rounded-full bg-white shadow-[0_0_8px_rgba(130,215,255,1)]" />
          </span>
        </div>
        <div className="absolute inset-x-4 bottom-4 flex items-center gap-3 text-white">
          <span className="relative h-[3px] w-24 shrink-0 overflow-hidden rounded-full bg-white/30">
            <span
              className="absolute inset-y-0 left-0 w-full origin-left rounded-full bg-[linear-gradient(90deg,#8fe0ff,#eafaff)] shadow-[0_0_10px_rgba(140,220,255,0.95)] transition-transform duration-1000 ease-gentle"
              style={{ transform: `scaleX(${Math.max(0.04, Math.min(1, progress))})` }}
            />
          </span>
          <span key={stage} className="fade min-w-0 flex-1 truncate text-[0.65625rem] uppercase tracking-[0.16em] drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)]">
            {stage}
          </span>
          <span className="shrink-0 text-[0.65625rem] tabular-nums tracking-[0.12em] text-white/80">
            {Math.min(step, steps)}/{steps}
          </span>
        </div>

      </div>
    </div>
  );
}

function bounds(points: Pt[]) {
  let [left, top, right, bottom] = [1, 1, 0, 0];
  for (const [x, y] of points) {
    left = Math.min(left, x);
    right = Math.max(right, x);
    top = Math.min(top, y);
    bottom = Math.max(bottom, y);
  }
  return { left, top, right, bottom };
}
