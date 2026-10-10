"use client";

// The moment a client writes back, inside the dashboard (DECISIONS D-089). While the dashboard is on screen it asks
// who is waiting every few seconds; a new reply rises in from the corner on deep sea, with their words and a gold
// way to answer, and the page underneath refreshes so Today and the menu count it too. Replies already waiting when
// the dashboard opened never pop up: Today lists them.

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { IconArrowRight, IconClose } from "@/components/ui/Icons";
import type { WaitingReply } from "@/lib/dashboard/replies";

/** Often enough to feel live, gentle on a serverless backend. Only while the tab is visible. */
const CHECK_EVERY_MS = 15_000;
/** More than three at once is a list, and Today already is one. */
const MOST = 3;
const LEAVE_MS = 200;

type Notice = WaitingReply & { leaving?: boolean };

export function ReplyNotice({ waiting }: { waiting: WaitingReply[] }) {
  const router = useRouter();
  const pathname = usePathname();
  // Every reply this dashboard has already counted, starting with the ones waiting when it opened.
  const [seen] = useState(() => new Set(waiting.map((w) => w.id)));
  const here = useRef(pathname);
  useEffect(() => {
    here.current = pathname;
  }, [pathname]);
  const [notices, setNotices] = useState<Notice[]>([]);

  const dismiss = useCallback((id: string) => {
    setNotices((list) => list.map((n) => (n.id === id ? { ...n, leaving: true } : n)));
    window.setTimeout(() => setNotices((list) => list.filter((n) => n.id !== id)), LEAVE_MS);
  }, []);

  /** Shows what's new. A check, being the latest word, also lets go of notices for replies answered since. */
  const consider = useCallback(
    (list: WaitingReply[], fromCheck: boolean) => {
      const fresh = list.filter((w) => !seen.has(w.id));
      fresh.forEach((w) => seen.add(w.id));
      const still = new Set(list.map((w) => w.id));
      // Already on that client's brief: the refresh puts the reply in the conversation in front of them.
      const show = fresh.filter((w) => here.current !== `/dashboard/clients/${w.clientId}`);
      if (show.length || fromCheck) setNotices((current) => [...show, ...current.filter((n) => !fromCheck || still.has(n.id))].slice(0, MOST));
      if (fresh.length && fromCheck) router.refresh();
    },
    [router, seen],
  );

  // A reply the server found on its own (a navigation, or the dashboard's catch-up of late email) counts as news too.
  useEffect(() => consider(waiting, false), [waiting, consider]);

  useEffect(() => {
    let alive = true;
    const check = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const response = await fetch("/api/dashboard/replies", { cache: "no-store" });
        if (!response.ok) return;
        const { waiting: list } = (await response.json()) as { waiting: WaitingReply[] };
        if (alive) consider(list, true);
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
      className="pointer-events-none fixed inset-x-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-50 flex flex-col gap-3 sm:inset-x-auto sm:bottom-6 sm:right-6 sm:w-[23.5rem]"
    >
      {notices.map((n) => (
        <article
          key={n.id}
          aria-label={`${n.first} wrote back`}
          data-leaving={n.leaving || undefined}
          className="reply-notice sea pointer-events-auto relative overflow-hidden rounded-[20px] p-5 pr-14 ring-1 ring-white/10"
        >
          <p className="flex items-center gap-2.5 text-[11px] uppercase tracking-[0.22em] text-[#e2c07a]">
            <span aria-hidden className="reply-dot relative h-1.5 w-1.5 rounded-full bg-[#e2c07a]" />
            New reply
          </p>
          <p className="mt-3 font-display text-[28px] font-light leading-none text-white">{n.first} wrote back.</p>
          <p className="mt-2 text-[12.5px] text-ink-soft">
            {n.name} · {n.channel === "sms" ? "By text" : "By email"} · Just now
          </p>
          <p className="mt-3 line-clamp-2 font-display text-[18px] font-light italic leading-snug text-[#d8e7ee]">&ldquo;{n.body}&rdquo;</p>
          <Link href={`/dashboard/clients/${n.clientId}#conversation`} onClick={() => dismiss(n.id)} className="btn-gold group mt-5 !h-11 gap-2 px-5">
            Answer {n.first}
            <IconArrowRight width={15} height={15} className="transition-transform duration-200 group-hover:translate-x-0.5" />
          </Link>
          <button
            type="button"
            onClick={() => dismiss(n.id)}
            aria-label={`Dismiss ${n.first}'s reply`}
            className="absolute right-2 top-2 grid h-10 w-10 place-items-center rounded-full text-ink-soft transition-colors duration-150 hover:bg-white/10 hover:text-white"
          >
            <IconClose width={16} height={16} />
          </button>
        </article>
      ))}
    </div>
  );
}
