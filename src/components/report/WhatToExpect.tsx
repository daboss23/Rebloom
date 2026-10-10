"use client";

import { useEffect, useState } from "react";

type Status = "pending" | "ready" | "none";

/** Polls this long between steps. Each poll moves the simulation forward by one provider check. */
const POLL_MS = 2500;
/** After this, the section quietly goes away instead of waiting forever. */
const GIVE_UP_MS = 3 * 60_000;

/**
 * "What to expect": today's photo beside YouCam's simulation of the plan (DECISIONS D-047).
 * Always labelled an illustration, never a promise (brief 6.5, FTC truth-in-advertising).
 */
export function WhatToExpect({
  token,
  scanId,
  initial,
  week,
}: {
  token: string;
  scanId: string;
  initial: Status;
  week: number | null;
}) {
  const [status, setStatus] = useState<Status>(initial);

  useEffect(() => {
    if (status !== "pending") return;
    const started = Date.now();
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const step = async () => {
      try {
        const res = await fetch(`/r/${token}/simulation/${scanId}`, { cache: "no-store" });
        const body = res.ok ? ((await res.json()) as { status: Status }) : { status: "none" as const };
        if (stopped) return;
        if (body.status !== "pending") return setStatus(body.status);
      } catch {
        // A dropped connection isn't a verdict. Try again on the next tick.
      }
      if (Date.now() - started > GIVE_UP_MS) return setStatus("none");
      timer = setTimeout(step, POLL_MS);
    };
    void step();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [status, token, scanId]);

  if (status === "none") return null;
  const later = week ? `Week ${week}, illustrated` : "After your plan, illustrated";

  return (
    <section className="mt-16" aria-labelledby="expect-heading">
      <h2 id="expect-heading" className="t-h2">
        What to expect
      </h2>
      <div className="mt-6 grid grid-cols-2 gap-3">
        <figure>
          <div className="relative aspect-[3/4] overflow-hidden rounded-[20px] bg-mist shadow-[0_24px_44px_-28px_rgba(12,44,62,0.55)] ring-1 ring-white/70">
            {/* eslint-disable-next-line @next/next/no-img-element -- private, token-scoped image */}
            <img src={`/r/${token}/photo/${scanId}`} alt="Your photo today" className="absolute inset-0 h-full w-full object-cover" />
          </div>
          <figcaption className="mt-2.5 text-[0.875rem] text-ink">Today</figcaption>
        </figure>
        <figure>
          <div className="relative aspect-[3/4] overflow-hidden rounded-[20px] bg-[linear-gradient(160deg,#f4f9fb,#cfe3ed)] shadow-[0_24px_44px_-28px_rgba(12,44,62,0.55)] ring-1 ring-white/70">
            {status === "ready" ? (
              // eslint-disable-next-line @next/next/no-img-element -- private, token-scoped image
              <img
                src={`/r/${token}/simulation/${scanId}/image`}
                alt={`An illustration of your skin at ${later.toLowerCase().replace(", illustrated", "")}`}
                className="absolute inset-0 h-full w-full object-cover fade"
              />
            ) : (
              <span className="absolute bottom-3 left-3 text-[0.75rem] uppercase tracking-[0.14em] text-[#1e5a78]" role="status" style={{ animation: "breathe 2.4s ease-in-out infinite" }}>
                Preparing
              </span>
            )}
          </div>
          <figcaption className="mt-2.5 text-[0.875rem] text-ink">{later}</figcaption>
        </figure>
      </div>
      <p className="t-caption mt-4">
        An illustration of likely improvement based on your scan. Not a guaranteed result. Everyone&apos;s skin responds
        differently.
      </p>
    </section>
  );
}
