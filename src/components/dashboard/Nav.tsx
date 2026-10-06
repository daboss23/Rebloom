"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/components/ui/cx";

export interface NavItem {
  href: string;
  label: string;
  /** A quiet count beside the label: people waiting, clients on the books. */
  count?: number;
}

const isActive = (pathname: string, href: string) => (href === "/dashboard" ? pathname === href : pathname.startsWith(href));

/** The left menu on desktop. */
export function SideNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <ul className="flex flex-col gap-px">
      {items.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cx(
                "group flex h-10 items-center justify-between px-3 text-[14px] transition-colors duration-200",
                active ? "bg-mist text-ink" : "text-text-2 hover:bg-mist/60 hover:text-ink",
              )}
            >
              <span className="flex items-center gap-3">
                <span
                  aria-hidden
                  className={cx("h-px w-3 transition-colors duration-200", active ? "bg-ink" : "bg-transparent group-hover:bg-sage")}
                />
                {item.label}
              </span>
              {item.count !== undefined && <span className="tabular-nums text-[12px] text-text-3">{item.count}</span>}
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
                "flex h-11 items-center gap-2 border-b px-2 text-[14px] transition-colors duration-200",
                active ? "border-ink text-ink" : "border-transparent text-text-3 hover:text-ink",
              )}
            >
              {item.label}
              {item.count !== undefined && <span className="tabular-nums text-[12px] text-text-3">{item.count}</span>}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
