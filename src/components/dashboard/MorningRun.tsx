"use client";

// The morning run (DECISIONS D-097): as Dana opens Today, the agent works through her whole book, one client at a
// time on screen, and leaves every draft in its place: answers on the brief, messages in the queue. This is the one
// place that shows it working. Once it's done it folds to a single line; nothing here sends anything.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { cx } from "@/components/ui/cx";
import { IconCheck } from "@/components/ui/Icons";
import type { DraftView } from "@/lib/agent/view";
import { Bloom } from "./Bloom";

export interface RunEntry {
  draft: DraftView;
  /** "Sofia Morales". */
  name: string;
  /** What it's writing: "Progress moment · email", "Answer to his text". */
  what: string;
  href: string;
}

/** How often to look while the agent works. Slow enough to be cheap, quick enough to watch. */
const POLL_MS = 2000;

export function MorningRun({ entries, staffName }: { entries: RunEntry[]; staffName: string }) {
  const router = useRouter();
  const listId = useId();
  // What polling has learned since the page came. The server's copy wins once it's finished: it's never older.
  const [polled, setPolled] = useState<Record<string, DraftView>>({});
  const current = (e: RunEntry) => (e.draft.status !== "working" ? e.draft : (polled[e.draft.id] ?? e.draft));
  const working = entries.filter((e) => current(e).status === "working");
  const ready = entries.filter((e) => current(e).status === "ready").length;
  const failed = entries.filter((e) => current(e).status === "failed").length;
  // Open while it works, folded to its summary once it's done, unless Dana chooses.
  const [choice, setChoice] = useState<boolean | null>(null);
  const open = choice ?? working.length > 0;
  const wasWorking = useRef(working.length > 0);
  const ids = working.map((e) => e.draft.id).join(",");

  useEffect(() => {
    if (!ids) {
      // Just finished: the rows below learn about their drafts.
      if (wasWorking.current) {
        wasWorking.current = false;
        router.refresh();
      }
      return;
    }
    wasWorking.current = true;
    let stop = false;
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/agent/drafts?ids=${encodeURIComponent(ids)}`, { cache: "no-store" });
        if (!res.ok || stop) return;
        const { drafts: fresh } = (await res.json()) as { drafts: DraftView[] };
        // A new object every time, so the next look is scheduled even when nothing moved.
        setPolled((all) => ({ ...all, ...Object.fromEntries(fresh.map((d) => [d.id, d])) }));
      } catch {
        // A blip: try again shortly.
        if (!stop) setPolled((all) => ({ ...all }));
      }
    }, POLL_MS);
    return () => {
      stop = true;
      clearTimeout(t);
    };
  }, [ids, polled, router]);

  // Nothing drafted (no credit, the valve reached): the book is as it was, so there's nothing worth a panel.
  if (entries.length === 0 || (working.length === 0 && ready === 0)) return null;
  const total = entries.length;
  const done = total - working.length;

  return (
    <section aria-labelledby="run-title" className="glass focus-in overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3 px-5 pb-5 pt-5 sm:px-6">
        <div className="grid min-w-0 grid-cols-[22px_minmax(0,1fr)] items-start gap-x-3">
          <Bloom size={22} unfurl={working.length === 0} className={cx("mt-1 text-[#9e4a5d]", working.length > 0 && "bloom-breathe")} />
          <div className="min-w-0">
            <h2 id="run-title" className="font-display text-[1.625rem] font-light leading-tight text-ink">
              Rebloom&apos;s morning run
            </h2>
            <p aria-live="polite" className="mt-1 text-[0.875rem] leading-relaxed text-text-2">
              {working.length > 0
                ? `Working through ${staffName}'s book: ${done} of ${total} done. Each draft is read from the client's scans, plan and the calendar, and checked before it lands.`
                : `${ready === 1 ? "One draft is" : `${ready} drafts are`} ready, each in its place below. Every time, price and link was checked first.${failed ? ` ${failed === 1 ? "One" : failed} couldn't be drafted and ${failed === 1 ? "is" : "are"} left as before.` : ""} Nothing is sent until you send it.`}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setChoice(!open)}
          aria-expanded={open}
          aria-controls={listId}
          className="tap ml-[34px] text-[0.8125rem] text-text-3 underline decoration-[#0c1a22]/20 underline-offset-4 transition-colors duration-150 hover:text-ink hover:decoration-ink sm:ml-0 sm:mt-2"
        >
          {open ? "Hide the run" : "Show the run"}
        </button>
      </div>

      {open && (
        <ol id={listId} className="divide-y divide-[#0c1a22]/[0.06] border-t border-[#0c1a22]/[0.06]">
          {entries.map((e, i) => {
            const d = current(e);
            const latest = d.steps[d.steps.length - 1];
            return (
              <li key={d.id} className="focus-in" style={{ animationDelay: `${Math.min(i, 8) * 60}ms` }}>
                <Link
                  href={e.href}
                  className="grid gap-x-6 gap-y-1 px-5 py-3.5 transition-colors duration-200 hover:bg-white/50 sm:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] sm:items-baseline sm:px-6"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-[0.9375rem] text-ink">{e.name}</span>
                    <span className="block text-[0.8125rem] text-text-3">{e.what}</span>
                  </span>
                  <span className="flex min-w-0 items-baseline gap-2 text-[0.8125rem] leading-relaxed">
                    {d.status === "working" ? (
                      <>
                        <span aria-hidden className="relative top-[-1px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#9e4a5d] motion-safe:animate-pulse" />
                        <span className="text-text-2">{latest ?? "Starting"}</span>
                      </>
                    ) : d.status === "ready" ? (
                      <>
                        <IconCheck aria-hidden width={14} height={14} className="relative top-[2px] shrink-0 text-[#1f7a63]" />
                        <span className="text-text-2">
                          <span className="text-ink">Ready to review</span>
                          {highlight(d) ? ` · ${highlight(d)}` : ""}
                        </span>
                      </>
                    ) : (
                      <span className="text-text-3">
                        {d.kind === "outreach" ? "Couldn't draft it, so the standard message is there." : "Couldn't draft it. You can try again on the brief."}
                      </span>
                    )}
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

/** The step worth a glance once it's done: what it found or caught, rather than "Read" or "Drafted". */
function highlight(d: DraftView): string | null {
  return d.steps.filter((s) => !/^(Read|Drafted|Looked at|Checked \w+'s)/.test(s)).pop() ?? null;
}
