"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/components/ui/cx";

export interface NavItem {
  href: string;
  label: string;
  /** A quiet count beside the label: people waiting, clients on the books. */
  count?: number;
  /** Replies waiting on an answer (D-089): a gold count that asks to be opened. */
  attention?: number;
}

const waitingLabel = (n: number) => `, ${n} ${n === 1 ? "reply" : "replies"} waiting`;

const isActive = (pathname: string, href: string) => (href === "/dashboard" ? pathname === href : pathname.startsWith(href));

/** The left menu on desktop, on deep sea. The current page carries a short gold rule. */
export function SideNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <ul className="flex flex-col gap-1">
      {items.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cx(
                "group relative flex h-11 items-center justify-between rounded-[12px] px-4 text-[0.875rem] transition-[background-color,color] duration-200",
                active ? "bg-white/[0.08] text-white" : "text-ink-soft hover:bg-white/[0.04] hover:text-white",
              )}
            >
              <span className="flex items-center gap-3">
                <span
                  aria-hidden
                  className={cx(
                    "h-px transition-[width,background-color] duration-300 ease-out",
                    active ? "w-4 bg-[#e2c07a]" : "w-2 bg-white/20 group-hover:w-3 group-hover:bg-white/40",
                  )}
                />
                {item.label}
              </span>
              {item.attention ? (
                <span className="flex items-center gap-1.5 text-[0.8125rem] tabular-nums text-[#e2c07a]">
                  <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[#e2c07a] shadow-[0_0_0_3px_rgb(226_192_122/0.18)]" />
                  {item.attention}
                  <span className="sr-only">{waitingLabel(item.attention)}</span>
                </span>
              ) : (
                item.count !== undefined && (
                  <span className={cx("tabular-nums text-[0.8125rem]", active ? "text-[#e2c07a]" : "text-ink-soft/80")}>{item.count}</span>
                )
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** The same menu as a row of tabs on smaller screens. */
export function TabNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <ul className="-mx-4 flex gap-1 overflow-x-auto px-4 [scrollbar-width:none]">
      {items.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <li key={item.href} className="shrink-0">
            <Link
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cx(
                "flex h-11 items-center gap-2 border-b-2 px-2 text-[0.875rem] transition-colors duration-200",
                active ? "border-[#c99645] text-ink" : "border-transparent text-text-3 hover:text-ink",
              )}
            >
              {item.label}
              {item.attention ? (
                <span className="flex items-center gap-1 text-[0.8125rem] font-medium tabular-nums text-[#7a5014]">
                  <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[#c99645]" />
                  {item.attention}
                  <span className="sr-only">{waitingLabel(item.attention)}</span>
                </span>
              ) : (
                item.count !== undefined && <span className="tabular-nums text-[0.8125rem] text-text-3">{item.count}</span>
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
