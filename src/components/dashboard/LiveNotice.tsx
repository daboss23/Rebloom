"use client";

// The moment something happens in the book, inside the dashboard (DECISIONS D-089, D-090): a client writes back, or
// someone scans themselves in as a new prospect, perhaps on their phone from the dashboard's own code. While the
// dashboard is on screen it checks every few seconds; the news rises in from the corner on deep sea with a gold way
// to act on it, and the page underneath refreshes so Today, Clients and the menu count it too. What was already there
// when the dashboard opened never pops up: the pages list it.

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { IconArrowRight, IconClose } from "@/components/ui/Icons";
import type { NewClient, WaitingReply } from "@/lib/dashboard/live";

/** Often enough to feel live, gentle on a serverless backend. Only while the tab is visible. */
const CHECK_EVERY_MS = 15_000;
/** More than three at once is a list, and the pages already are. */
const MOST = 3;
const LEAVE_MS = 200;

interface Live {
  waiting: WaitingReply[];
  arrivals: NewClient[];
}

type Notice = ({ kind: "reply"; item: WaitingReply } | { kind: "arrival"; item: NewClient }) & { key: string; leaving?: boolean };

const notices = ({ waiting, arrivals }: Live): Notice[] => [
  ...arrivals.map((item) => ({ kind: "arrival" as const, item, key: `client:${item.clientId}` })),
  ...waiting.map((item) => ({ kind: "reply" as const, item, key: `reply:${item.id}` })),
];

export function LiveNotice(live: Live) {
  const router = useRouter();
  const pathname = usePathname();
  // Everything this dashboard has already counted, starting with what was there when it opened.
  const [seen] = useState(() => new Set(notices(live).map((n) => n.key)));
  const here = useRef(pathname);
  useEffect(() => {
    here.current = pathname;
  }, [pathname]);
  const [shown, setShown] = useState<Notice[]>([]);

  const dismiss = useCallback((key: string) => {
    setShown((list) => list.map((n) => (n.key === key ? { ...n, leaving: true } : n)));
    window.setTimeout(() => setShown((list) => list.filter((n) => n.key !== key)), LEAVE_MS);
  }, []);

  /** Shows what's new. A check, being the latest word, also lets go of notices that no longer apply (answered). */
  const consider = useCallback(
    (next: Live, fromCheck: boolean) => {
      const all = notices(next);
      const fresh = all.filter((n) => !seen.has(n.key));
      fresh.forEach((n) => seen.add(n.key));
      const still = new Set(all.map((n) => n.key));
      // Already on that client's brief: the refresh puts the news in front of them.
      const show = fresh.filter((n) => here.current !== `/dashboard/clients/${n.item.clientId}`);
      if (show.length || fromCheck) setShown((current) => [...show, ...current.filter((n) => !fromCheck || still.has(n.key))].slice(0, MOST));
      if (fresh.length && fromCheck) router.refresh();
    },
    [router, seen],
  );

  // News the server found on its own (a navigation, or the dashboard's catch-up of late email) counts too.
  const { waiting, arrivals } = live;
  useEffect(() => consider({ waiting, arrivals }, false), [waiting, arrivals, consider]);

  useEffect(() => {
    let alive = true;
    const check = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const response = await fetch("/api/dashboard/live", { cache: "no-store" });
        if (!response.ok) return;
        const next = (await response.json()) as Live;
        if (alive) consider(next, true);
      } catch {
        // Offline for a moment: the next check catches up.
      }
    };
    const timer = window.setInterval(check, CHECK_EVERY_MS);
    const back = () => document.visibilityState === "visible" && check();
    document.addEventListener("visibilitychange", back);
    window.addEventListener("focus", back);
    return () => {
      alive = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", back);
      window.removeEventListener("focus", back);
    };
  }, [consider]);

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-50 flex flex-col gap-3 sm:inset-x-auto sm:bottom-6 sm:right-6 sm:w-[376px]"
    >
      {shown.map((n) => {
        const { first, name, clientId } = n.item;
        const reply = n.kind === "reply" ? n.item : null;
        const label = reply ? `${first} wrote back` : `${first} just scanned`;
        return (
          <article
            key={n.key}
            aria-label={label}
            data-leaving={n.leaving || undefined}
            className="reply-notice sea pointer-events-auto relative overflow-hidden rounded-[20px] p-5 pr-14 ring-1 ring-white/10"
          >
            <p className="flex items-center gap-2.5 text-[0.75rem] uppercase tracking-[0.22em] text-[#e2c07a]">
              <span aria-hidden className="reply-dot relative h-1.5 w-1.5 rounded-full bg-[#e2c07a]" />
              {reply ? "New reply" : "New prospect"}
            </p>
            <p className="mt-3 font-display text-[1.75rem] font-light leading-none text-white">{label}.</p>
            <p className="mt-2 text-[0.8125rem] text-ink-soft">
              {name} · {reply ? (reply.channel === "sms" ? "By text" : "By email") : "First scan"} · Just now
            </p>
            {reply ? (
              <p className="mt-3 line-clamp-2 font-display text-[1.125rem] font-light italic leading-snug text-[#d8e7ee]">&ldquo;{reply.body}&rdquo;</p>
            ) : (
              <p className="mt-3 text-[0.875rem] leading-relaxed text-[#d8e7ee]">Their report and plan are ready, and they&apos;re in your book.</p>
            )}
            <Link
              href={`/dashboard/clients/${clientId}${reply ? "#conversation" : ""}`}
              onClick={() => dismiss(n.key)}
              className="btn-gold group mt-5 !h-11 gap-2 px-5"
            >
              {reply ? `Answer ${first}` : `Open ${first}'s brief`}
              <IconArrowRight width={15} height={15} className="transition-transform duration-200 group-hover:translate-x-0.5" />
            </Link>
            <button
              type="button"
              onClick={() => dismiss(n.key)}
              aria-label={`Dismiss: ${label}`}
              className="absolute right-2 top-2 grid h-10 w-10 place-items-center rounded-full text-ink-soft transition-colors duration-150 hover:bg-white/10 hover:text-white"
            >
              <IconClose width={16} height={16} />
            </button>
          </article>
        );
      })}
    </div>
  );
}
