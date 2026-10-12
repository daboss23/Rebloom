import Link from "next/link";
import type { ReactNode } from "react";
import { signOut } from "@/app/dashboard/actions";
import { RebloomWordmark } from "@/components/ui/Wordmarks";
import type { NewClient, WaitingReply } from "@/lib/dashboard/live";
import type { Clinic, Staff } from "@/lib/domain";
import { MobileMenu } from "./MobileMenu";
import { SideNav, type NavItem } from "./Nav";
import { LiveNotice } from "./LiveNotice";
import { TimeTravel, type ClockReading } from "./TimeTravel";

interface ShellProps {
  clinic: Clinic;
  staff: Staff;
  dateLabel: string;
  /** The demo clock's time, for its face: the virtual now, the clinic's zone, and how far ahead it runs in minutes. */
  clock: ClockReading;
  demo: boolean;
  queueCount: number;
  clientCount: number;
  /** Clients who wrote back and wait on an answer (D-081, D-089). */
  waiting: WaitingReply[];
  /** People who scanned themselves in (D-090). */
  arrivals: NewClient[];
  children: ReactNode;
}

/** The dashboard frame: a deep-sea menu carrying the gold logo, glass across the top. Below desktop the same menu slides in. */
export function Shell({ clinic, staff, dateLabel, clock, demo, queueCount, clientCount, waiting, arrivals, children }: ShellProps) {
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
      <div className="mt-auto">
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
    <div className="rebloom min-h-dvh lg:grid lg:grid-cols-[248px_minmax(0,1fr)]">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:bg-ink focus:px-4 focus:py-2 focus:text-porcelain">
        Skip to content
      </a>

      {/* ---------- Desktop menu ---------- */}
      <aside className="sea on-dark hidden lg:flex sticky top-0 h-dvh flex-col px-4 pb-6 pt-8">
        {menu}
      </aside>

      <div className="min-w-0">
        {/* ---------- Top bar ---------- */}
        <header className="sticky top-0 z-30 border-b border-white/70 bg-white/55 backdrop-blur-xl backdrop-saturate-150">
          <div className="flex h-16 items-center justify-between gap-3 px-4 sm:gap-6 sm:px-6 lg:px-12">
            <div className="flex min-w-0 items-center gap-3 sm:gap-4">
              <Link href="/dashboard" className="shrink-0 lg:hidden" aria-label="Rebloom, today">
                <RebloomWordmark height={16} className="!h-[14px] sm:!h-4" />
              </Link>
              <span aria-hidden className="h-5 w-px bg-mist lg:hidden" />
              <p className="min-w-0 truncate text-[0.875rem] text-text-2">
                <span className="font-display text-[0.9375rem] font-medium tracking-[0.16em] text-ink sm:text-[1.0625rem] sm:tracking-[0.2em]">{clinic.wordmark}</span>
                <span className="hidden sm:inline text-text-3"> · {clinic.city}</span>
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-4">
              {demo && (
                <div className="hidden xl:block">
                  <TimeTravel dateLabel={dateLabel} clock={clock} />
                </div>
              )}
              <div className="lg:hidden">
                <MobileMenu attention={waiting.length}>{menu}</MobileMenu>
              </div>
            </div>
          </div>
        </header>

        {demo && (
          <div className="border-b border-white/70 bg-white/40 px-4 py-3 sm:px-6 lg:px-12 xl:hidden">
            <TimeTravel dateLabel={dateLabel} clock={clock} compact />
          </div>
        )}

        <main id="main" tabIndex={-1} className="px-4 pb-24 pt-8 sm:px-6 lg:px-12 lg:pt-10">
          <div className="mx-auto max-w-[1220px]">{children}</div>
        </main>
        <LiveNotice waiting={waiting} arrivals={arrivals} />
      </div>
    </div>
  );
}
