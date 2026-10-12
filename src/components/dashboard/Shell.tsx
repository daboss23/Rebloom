import Link from "next/link";
import type { ReactNode } from "react";
import { signOut } from "@/app/dashboard/actions";
import { RebloomWordmark } from "@/components/ui/Wordmarks";
import type { NewClient, WaitingReply } from "@/lib/dashboard/live";
import type { Clinic, Staff } from "@/lib/domain";
import { DemoClockCard, DemoClockChip, type ClockReading, type OpeningDay } from "./DemoClock";
import { MobileMenu } from "./MobileMenu";
import { SideNav, type NavItem } from "./Nav";
import { LiveNotice } from "./LiveNotice";

interface ShellProps {
  clinic: Clinic;
  staff: Staff;
  dateLabel: string;
  /** The demo clock's time, for its face: the virtual now, the clinic's zone, and how far ahead it runs in minutes. */
  clock: ClockReading;
  /** The days the demo clock's calendar can land on, each at its opening. */
  openings: OpeningDay[];
  demo: boolean;
  queueCount: number;
  clientCount: number;
  /** Clients who wrote back and wait on an answer (D-081, D-089). */
  waiting: WaitingReply[];
  /** People who scanned themselves in (D-090). */
  arrivals: NewClient[];
  children: ReactNode;
}

/**
 * The dashboard frame: a deep-sea menu carrying the gold logo, the clinic and the demo clock. On desktop it stands at the
 * left; below, a black bar carries the logo, the clock and the button that slides the same menu in.
 */
export function Shell({ clinic, staff, dateLabel, clock, openings, demo, queueCount, clientCount, waiting, arrivals, children }: ShellProps) {
  const items: NavItem[] = [
    { href: "/dashboard", label: "Today", attention: waiting.length },
    { href: "/dashboard/clients", label: "Clients", count: clientCount },
    { href: "/dashboard/rebook", label: "Rebook", count: queueCount },
    { href: "/dashboard/insights", label: "Insights" },
  ];
  const settings: NavItem[] = [{ href: "/dashboard/settings", label: "Settings" }];

  // One menu, two homes: the sidebar on desktop, the sheet on smaller screens.
  const menu = (
    <>
      <Link href="/dashboard" className="px-4" aria-label="Rebloom, today">
        <RebloomWordmark height={22} />
      </Link>
      <p className="mt-3 px-4 text-[0.75rem] uppercase tracking-[0.22em] text-ink-soft/80">{clinic.name}</p>
      <nav aria-label="Dashboard" className="mt-12">
        <SideNav items={items} />
      </nav>
      {demo && (
        <div className="mt-8">
          <DemoClockCard dateLabel={dateLabel} clock={clock} openings={openings} />
        </div>
      )}
      <div className="mt-auto pt-8">
        <nav aria-label="Settings">
          <SideNav items={settings} />
        </nav>
        <div className="mt-6 flex items-center gap-3 border-t border-white/10 px-4 pt-6">
          <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-[#e2c07a]/50 font-display text-[1.125rem] text-[#e2c07a]">
            {staff.name[0]}
          </span>
          <div className="min-w-0">
            <p className="text-[0.875rem] text-white">{staff.name}</p>
            <p className="text-[0.8125rem] text-ink-soft">{staff.title}</p>
          </div>
        </div>
        <form action={signOut} className="px-4">
          <button type="submit" className="mt-4 text-[0.8125rem] text-ink-soft underline decoration-white/20 underline-offset-4 transition-colors duration-200 hover:text-white hover:decoration-white/60">
            Sign out
          </button>
        </form>
      </div>
    </>
  );

  return (
    <div className="rebloom min-h-dvh lg:grid lg:grid-cols-[272px_minmax(0,1fr)]">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:bg-ink focus:px-4 focus:py-2 focus:text-porcelain">
        Skip to content
      </a>

      {/* ---------- Desktop menu ---------- */}
      <aside className="sea on-dark hidden lg:flex sticky top-0 h-dvh flex-col overflow-y-auto overscroll-contain px-4 pb-6 pt-8 [scrollbar-width:none]">
        {menu}
      </aside>

      <div className="min-w-0">
        {/* ---------- Top bar, below desktop ---------- */}
        <header className="on-dark sticky top-0 z-30 border-b border-white/10 bg-black/90 backdrop-blur-xl backdrop-saturate-150 lg:hidden">
          <div className="grid h-16 grid-cols-[1fr_auto_1fr] items-center gap-2 px-4 sm:px-6">
            <div className="justify-self-start">{demo && <DemoClockChip dateLabel={dateLabel} clock={clock} openings={openings} />}</div>
            <Link href="/dashboard" aria-label="Rebloom, today" className="justify-self-center">
              <RebloomWordmark height={22} className="!h-[19px] sm:!h-[22px]" shine />
            </Link>
            <div className="justify-self-end">
              <MobileMenu attention={waiting.length}>{menu}</MobileMenu>
            </div>
          </div>
        </header>

        <main id="main" tabIndex={-1} className="px-4 pb-24 pt-8 sm:px-6 lg:px-12 lg:pt-10">
          <div className="mx-auto max-w-[1220px]">{children}</div>
        </main>
        <LiveNotice waiting={waiting} arrivals={arrivals} />
      </div>
    </div>
  );
}
