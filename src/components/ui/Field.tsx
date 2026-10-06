import type { ComponentProps, ReactNode } from "react";
import { cx } from "./cx";

// Glass fields (DECISIONS D-061). 16px text, so phones don't zoom in when a field takes focus.
const control =
  "w-full rounded-[12px] border border-[#0c1a22]/10 bg-white/80 px-4 text-[16px] text-ink placeholder:text-text-3 " +
  "outline-none transition-[border-color,box-shadow,background-color] duration-200 " +
  "focus:border-[#1e5a78]/50 focus:bg-white focus:shadow-[0_0_0_4px_rgba(159,201,221,0.35)]";

export function FieldLabel({ htmlFor, children, optional }: { htmlFor: string; children: ReactNode; optional?: boolean }) {
  return (
    <label htmlFor={htmlFor} className="t-label mb-2 flex justify-between">
      <span>{children}</span>
      {optional && <span className="normal-case tracking-normal text-[12px]">Optional</span>}
    </label>
  );
}

export function TextInput({ className, ...props }: ComponentProps<"input">) {
  return <input className={cx(control, "min-h-12", className)} {...props} />;
}

export function TextArea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cx(control, "min-h-28 py-3 leading-relaxed resize-none", className)} {...props} />;
}

/** A checkbox with a visible label. Real input, so it's keyboard and screen-reader friendly. */
export function Checkbox({
  id,
  children,
  className,
  ...props
}: { id: string; children: ReactNode } & Omit<ComponentProps<"input">, "type" | "id">) {
  return (
    <label htmlFor={id} className={cx("flex cursor-pointer items-start gap-4", className)}>
      <span className="relative mt-px shrink-0">
        <input id={id} type="checkbox" className="peer absolute inset-0 h-[22px] w-[22px] cursor-pointer opacity-0" {...props} />
        <span
          aria-hidden
          className="block h-[22px] w-[22px] rounded-[7px] border border-[#0c1a22]/25 bg-white/80 transition-[background-color,border-color,box-shadow] duration-200 peer-checked:border-transparent peer-checked:bg-[linear-gradient(180deg,#23668a_0%,#134560_100%)] peer-checked:shadow-[0_6px_14px_-8px_rgba(19,69,96,0.8)] peer-focus-visible:outline peer-focus-visible:outline-1 peer-focus-visible:outline-offset-3 peer-focus-visible:outline-ink"
        />
        <svg
          aria-hidden
          viewBox="0 0 22 22"
          className="pointer-events-none absolute inset-0 h-[22px] w-[22px] text-white opacity-0 transition-opacity duration-200 peer-checked:opacity-100"
        >
          <path d="M6 11.5l3.4 3.2L16.5 7.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <span className="t-body">{children}</span>
    </label>
  );
}
