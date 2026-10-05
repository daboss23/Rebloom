import type { ComponentProps, ReactNode } from "react";
import { cx } from "./cx";

const control =
  "w-full bg-transparent border border-mist px-3 text-[15px] text-ink placeholder:text-text-3/70 " +
  "transition-colors duration-300 ease-gentle focus:border-ink focus:outline-none focus-visible:outline-1 focus-visible:outline-ink";

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

/** A square checkbox with a visible label. Real input, so it's keyboard and screen-reader friendly. */
export function Checkbox({
  id,
  children,
  className,
  ...props
}: { id: string; children: ReactNode } & Omit<ComponentProps<"input">, "type" | "id">) {
  return (
    <label htmlFor={id} className={cx("flex gap-4 items-start cursor-pointer", className)}>
      <span className="relative mt-[2px] shrink-0">
        <input id={id} type="checkbox" className="peer absolute inset-0 h-5 w-5 opacity-0 cursor-pointer" {...props} />
        <span
          aria-hidden
          className="block h-5 w-5 border border-ink transition-colors duration-300 peer-checked:bg-ink peer-focus-visible:outline peer-focus-visible:outline-1 peer-focus-visible:outline-offset-3 peer-focus-visible:outline-ink"
        />
        <svg
          aria-hidden
          viewBox="0 0 20 20"
          className="pointer-events-none absolute inset-0 h-5 w-5 opacity-0 peer-checked:opacity-100 text-porcelain"
        >
          <path d="M5 10.5l3.2 3L15 6.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </span>
      <span className="t-body">{children}</span>
    </label>
  );
}
