import Link from "next/link";
import { IconCheckCircle } from "@/components/ui/Icons";
import { ScoreRuler } from "@/components/ui/ScoreRuler";
import { cx } from "@/components/ui/cx";
import { formatLongDate } from "@/lib/clock";
import type { ConcernProgress, Progress } from "@/lib/report/progress";

const scanLabel = (n: number) => `Scan ${String(n).padStart(2, "0")}`;

/** Scan 01 beside the latest, the way the client took them (brief 3.1 step 10). */
export function ScanPair({ token, progress, tz }: { token: string; progress: Progress; tz: string }) {
  const { first, latest } = progress;
  return (
    <section aria-label="Your first and latest scans" className="focus-in mt-8" style={{ animationDelay: "200ms" }}>
      <div className="grid grid-cols-2 gap-3">
        {[first, latest].map((s) => (
          <figure key={s.id}>
            <div className="relative aspect-[3/4] overflow-hidden rounded-[20px] bg-mist shadow-[0_24px_48px_-30px_rgba(12,44,62,0.6)] ring-1 ring-white/70">
              {/* eslint-disable-next-line @next/next/no-img-element -- private, token-scoped image */}
              <img src={`/r/${token}/photo/${s.id}`} alt={`${scanLabel(s.scanNumber)} photo`} className="absolute inset-0 h-full w-full object-cover" />
              {/* A soft shade under the label, so it reads on a white shirt as well as a dark one. */}
              <span aria-hidden className="absolute inset-x-0 bottom-0 h-16 bg-[linear-gradient(180deg,rgba(12,26,34,0)_0%,rgba(12,26,34,0.42)_100%)]" />
              <span className="absolute bottom-2.5 left-3 text-[0.75rem] uppercase tracking-[0.14em] text-white/95 drop-shadow-[0_1px_2px_rgba(0,0,0,0.45)]">
                {scanLabel(s.scanNumber)}
              </span>
            </div>
            <figcaption className="mt-2.5 text-[0.875rem] text-ink">{formatLongDate(s.completedAt ?? s.createdAt, tz).replace(/, \d{4}$/, "")}</figcaption>
          </figure>
        ))}
      </div>
      {progress.verified ? (
        <p className="glass mt-4 flex items-center gap-2.5 px-4 py-3 text-[0.875rem] text-ink">
          <IconCheckCircle aria-hidden width={17} height={17} className="shrink-0 text-[var(--growth)]" />
          Same light, same angle. Verified at capture.
        </p>
      ) : !progress.confident ? (
        <p className="glass mt-4 px-4 py-3 text-[0.875rem] leading-relaxed text-text-2">
          Your latest photo was taken in different light from your first, so changes are shown without badges until your
          next scan confirms them.
        </p>
      ) : null}
    </section>
  );
}

/** One priority's change: the two scores, a badge only when the raw scores confirm it, and its line (D-010). */
export function WhatsChanged({ items }: { items: ConcernProgress[] }) {
  return (
    <section className="mt-16" aria-labelledby="changed">
      <h2 id="changed" className="t-h2">
        What&apos;s changed
      </h2>
      <p className="t-body mt-3">Your three priorities, scored from 1 to 100. Higher means healthier-looking skin.</p>
      <ol className="mt-7 space-y-3">
        {items.map((i) => (
          <li key={i.key} className="glass px-5 py-5">
            <div className="flex items-center justify-between gap-4">
              <h3 className="text-[0.96875rem] text-ink">{i.label}</h3>
              {i.badge && (
                <span className="rounded-full bg-[var(--growth)]/10 px-2.5 py-1 text-[0.8125rem] tabular-nums text-[var(--growth)] ring-1 ring-inset ring-[var(--growth)]/20">
                  {i.badge}
                </span>
              )}
            </div>
            <div className="mt-3 flex items-end justify-between gap-4">
              <p className="flex items-baseline gap-3 font-display font-light leading-none text-ink">
                <span className="sr-only">
                  {i.from} at your first scan, {i.to} now.
                </span>
                <span aria-hidden className="text-[1.875rem] text-text-3">
                  {i.from}
                </span>
                <span aria-hidden className="text-[1.375rem] text-text-3">
                  →
                </span>
                <span aria-hidden className="text-[3.25rem]">
                  {i.to}
                </span>
              </p>
              <Sparkline values={i.series} tone={i.verdict === "improved" ? "growth" : "sea"} />
            </div>
            {/* The marker slides from the first score to today's. Green only for a confirmed improvement (D-010). */}
            <ScoreRuler value={i.to} from={i.from} tone={i.badge && i.verdict === "improved" ? "growth" : "sea"} className="mt-4" />
            <p className="t-body mt-4">{i.line}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

/** A small trend line across every scan, oldest first. Decorative: the numbers carry the meaning. */
function Sparkline({ values, tone }: { values: number[]; tone: "growth" | "sea" }) {
  if (values.length < 2) return null;
  const [w, h, pad] = [112, 32, 4];
  const lo = Math.min(...values) - 2;
  const hi = Math.max(...values) + 2;
  const pts = values.map((v, i) => [pad + (i * (w - 2 * pad)) / (values.length - 1), pad + (1 - (v - lo) / (hi - lo)) * (h - 2 * pad)]);
  const [lx, ly] = pts[pts.length - 1];
  return (
    <svg aria-hidden viewBox={`0 0 ${w} ${h}`} width={w} height={h} className={cx("mb-1 shrink-0", tone === "growth" ? "text-[var(--growth)]" : "text-[#1e5a78]")}>
      <polyline points={pts.map((p) => p.join(",")).join(" ")} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.85" />
      <circle cx={lx} cy={ly} r="3" fill="currentColor" />
    </svg>
  );
}

/** The way back in for a client between sessions (brief 3.1 step 9). */
export function RescanInvite({ token, again }: { token: string; again: boolean }) {
  return (
    <div className="glass mt-3 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 px-5 py-4">
      <p className="text-[0.9375rem] leading-snug text-ink">
        {again ? "Ready for your next progress scan?" : "Between sessions, see what's changed."}
        <span className="t-caption block">Two minutes from home, the same steps as your first scan.</span>
      </p>
      <Link href={`/r/${token}/rescan`} className="btn-ghost !h-11 shrink-0 text-[0.9375rem]">
        Take a progress scan
      </Link>
    </div>
  );
}
