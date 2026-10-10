import Link from "next/link";
import type { ReactNode } from "react";
import { signOut } from "@/app/dashboard/actions";
import { RebloomWordmark } from "@/components/ui/Wordmarks";
import type { NewClient, WaitingReply } from "@/lib/dashboard/live";
import type { Clinic, Staff } from "@/lib/domain";
import { SideNav, TabNav, type NavItem } from "./Nav";
import { LiveNotice } from "./LiveNotice";
import { TimeTravel } from "./TimeTravel";

interface ShellProps {
  clinic: Clinic;
  staff: Staff;
  dateLabel: string;
  offsetDays: number;
  demo: boolean;
  queueCount: number;
  clientCount: number;
  /** Clients who wrote back and wait on an answer (D-081, D-089). */
  waiting: WaitingReply[];
  /** People who scanned themselves in (D-090). */
  arrivals: NewClient[];
  children: ReactNode;
}

/** The dashboard frame: a deep-sea menu carrying the gold logo, glass across the top. */
export function Shell({ clinic, staff, dateLabel, offsetDays, demo, queueCount, clientCount, waiting, arrivals, children }: ShellProps) {
  const items: NavItem[] = [
    { href: "/dashboard", label: "Today", attention: waiting.length },
    { href: "/dashboard/clients", label: "Clients", count: clientCount },
    { href: "/dashboard/rebook", label: "Rebook", count: queueCount },
    { href: "/dashboard/insights", label: "Insights" },
  ];
  const settings: NavItem[] = [{ href: "/dashboard/settings", label: "Settings" }];

  return (
    <div className="rebloom min-h-dvh lg:grid lg:grid-cols-[248px_minmax(0,1fr)]">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:bg-ink focus:px-4 focus:py-2 focus:text-porcelain">
        Skip to content
      </a>

      {/* ---------- Desktop menu ---------- */}
      <aside className="sea on-dark hidden lg:flex sticky top-0 h-dvh flex-col px-4 pb-6 pt-8">
        <Link href="/dashboard" className="px-4" aria-label="Rebloom, today">
          <RebloomWordmark height={22} />
        </Link>
        <p className="mt-3 px-4 text-[10.5px] uppercase tracking-[0.22em] text-ink-soft/80">{clinic.name}</p>
        <nav aria-label="Dashboard" className="mt-12">
          <SideNav items={items} />
        </nav>
        <div className="mt-auto">
          <nav aria-label="Settings">
            <SideNav items={settings} />
          </nav>
          <div className="mt-6 flex items-center gap-3 border-t border-white/10 px-4 pt-6">
            <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-[#e2c07a]/50 font-display text-[18px] text-[#e2c07a]">
              {staff.name[0]}
            </span>
            <div className="min-w-0">
              <p className="text-[14px] text-white">{staff.name}</p>
              <p className="text-[12px] text-ink-soft">{staff.title}</p>
            </div>
          </div>
          <form action={signOut} className="px-4">
            <button type="submit" className="mt-4 text-[12px] text-ink-soft underline decoration-white/20 underline-offset-4 transition-colors duration-200 hover:text-white hover:decoration-white/60">
              Sign out
            </button>
          </form>
        </div>
      </aside>

      <div className="min-w-0">
        {/* ---------- Top bar ---------- */}
        <header className="sticky top-0 z-30 border-b border-white/70 bg-white/55 backdrop-blur-xl backdrop-saturate-150">
          <div className="flex h-16 items-center justify-between gap-6 px-4 sm:px-6 lg:px-12">
            <div className="flex min-w-0 items-center gap-4">
              <Link href="/dashboard" className="lg:hidden" aria-label="Rebloom, today">
                <RebloomWordmark height={16} />
              </Link>
              <span aria-hidden className="h-5 w-px bg-mist lg:hidden" />
              <p className="min-w-0 truncate text-[14px] text-text-2">
                <span className="font-display text-[17px] font-medium tracking-[0.2em] text-ink">{clinic.wordmark}</span>
                <span className="hidden sm:inline text-text-3"> · {clinic.city}</span>
              </p>
            </div>
            {demo && (
              <div className="hidden md:block">
                <TimeTravel dateLabel={dateLabel} offsetDays={offsetDays} />
              </div>
            )}
          </div>
          <nav aria-label="Dashboard" className="border-t border-white/70 px-4 sm:px-6 lg:hidden">
            <TabNav items={[...items, ...settings]} />
          </nav>
        </header>

        {demo && (
          <div className="border-b border-white/70 bg-white/40 px-4 py-3 sm:px-6 md:hidden">
            <TimeTravel dateLabel={dateLabel} offsetDays={offsetDays} compact />
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
