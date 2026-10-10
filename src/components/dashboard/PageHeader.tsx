import type { ReactNode } from "react";

/** Every dashboard page opens the same way: a sea-blue kicker, a big light serif title, then its controls. */
export function PageHeader({ kicker, title, children, aside }: { kicker: ReactNode; title: ReactNode; children?: ReactNode; aside?: ReactNode }) {
  return (
    <header className="focus-in flex flex-wrap items-end justify-between gap-x-10 gap-y-6">
      <div className="min-w-0">
        <p className="text-[0.75rem] uppercase tracking-[0.22em] text-[#1e5a78]">{kicker}</p>
        <h1 className="mt-3 font-display text-[clamp(44px,5.6vw,72px)] font-light leading-[0.95] tracking-[-0.025em] text-ink">{title}</h1>
        {children && <div className="mt-4 max-w-xl text-[1rem] leading-relaxed text-text-2">{children}</div>}
      </div>
      {aside}
    </header>
  );
}

/** Filter pills: glass at rest, sea when chosen. */
export const pill = (active: boolean) =>
  [
    "flex h-10 items-center gap-2 whitespace-nowrap rounded-full px-4 text-[0.8125rem] transition-[background-color,color,box-shadow] duration-200",
    active
      ? "bg-[linear-gradient(180deg,#23668a,#134560)] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.25),0_10px_22px_-12px_rgba(19,69,96,0.7)]"
      : "bg-white/60 text-text-2 ring-1 ring-inset ring-white/90 hover:bg-white hover:text-ink",
  ].join(" ");
