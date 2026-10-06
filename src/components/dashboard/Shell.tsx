import Link from "next/link";
import type { ReactNode } from "react";
import { signOut } from "@/app/dashboard/actions";
import { RebloomWordmark } from "@/components/ui/Wordmarks";
import type { Clinic, Staff } from "@/lib/domain";
import { SideNav, TabNav, type NavItem } from "./Nav";
import { TimeTravel } from "./TimeTravel";

interface ShellProps {
  clinic: Clinic;
  staff: Staff;
  dateLabel: string;
  offsetDays: number;
  demo: boolean;
  queueCount: number;
  clientCount: number;
  children: ReactNode;
}

/** The dashboard frame: a slim menu on the left, the clinic and the demo clock across the top. */
export function Shell({ clinic, staff, dateLabel, offsetDays, demo, queueCount, clientCount, children }: ShellProps) {
  const items: NavItem[] = [
    { href: "/dashboard", label: "Today" },
    { href: "/dashboard/clients", label: "Clients", count: clientCount },
    { href: "/dashboard/rebook", label: "Rebook", count: queueCount },
    { href: "/dashboard/insights", label: "Insights" },
  ];
  const settings: NavItem[] = [{ href: "/dashboard/settings", label: "Settings" }];

  return (
    <div className="rebloom min-h-dvh lg:grid lg:grid-cols-[232px_minmax(0,1fr)]">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:bg-ink focus:px-4 focus:py-2 focus:text-porcelain">
        Skip to content
      </a>

      {/* ---------- Desktop menu ---------- */}
      <aside className="hidden lg:flex sticky top-0 h-dvh flex-col border-r border-mist bg-panel px-4 pb-6 pt-7">
        <Link href="/dashboard" className="px-3" aria-label="Rebloom, today">
          <RebloomWordmark className="!text-[28px] !font-light tracking-[-0.01em]" />
        </Link>
        <nav aria-label="Dashboard" className="mt-10">
          <SideNav items={items} />
        </nav>
        <div className="mt-auto">
          <nav aria-label="Settings">
            <SideNav items={settings} />
          </nav>
          <div className="mt-6 border-t border-mist px-3 pt-5">
            <p className="text-[14px] text-ink">{staff.name}</p>
            <p className="t-caption !text-[12px]">{staff.title}</p>
            <form action={signOut}>
              <button type="submit" className="mt-3 text-[12px] text-text-3 underline decoration-mist underline-offset-4 transition-colors duration-200 hover:text-ink hover:decoration-ink">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </aside>

      <div className="min-w-0">
        {/* ---------- Top bar ---------- */}
        <header className="sticky top-0 z-30 border-b border-mist bg-porcelain">
          <div className="flex h-16 items-center justify-between gap-6 px-4 sm:px-6 lg:px-12">
            <div className="flex min-w-0 items-center gap-4">
              <Link href="/dashboard" className="lg:hidden" aria-label="Rebloom, today">
                <RebloomWordmark className="!text-[24px] !font-light" />
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
          <nav aria-label="Dashboard" className="border-t border-mist px-4 sm:px-6 lg:hidden">
            <TabNav items={[...items, ...settings]} />
          </nav>
        </header>

        {demo && (
          <div className="border-b border-mist px-4 py-3 sm:px-6 md:hidden">
            <TimeTravel dateLabel={dateLabel} offsetDays={offsetDays} compact />
          </div>
        )}

        <main id="main" tabIndex={-1} className="px-4 pb-24 pt-10 sm:px-6 lg:px-12 lg:pt-14">
          <div className="mx-auto max-w-[1180px]">{children}</div>
        </main>
      </div>
    </div>
  );
}
