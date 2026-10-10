"use client";
import type { ComponentProps } from "react";
import { cx } from "./cx";

/** Toggle chip for answers: a glass pill, deep sea when chosen (DECISIONS D-061). 44px tall. */
export function Chip({
  selected,
  className,
  ...props
}: { selected: boolean } & Omit<ComponentProps<"button">, "aria-pressed">) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cx(
        "inline-flex min-h-11 items-center rounded-full border px-4 text-left text-[0.90625rem] leading-tight transition-[background-color,border-color,color,box-shadow,transform] duration-200 ease-out active:scale-[0.97]",
        selected
          ? "border-transparent bg-[linear-gradient(180deg,#23668a_0%,#134560_100%)] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.28),0_10px_22px_-12px_rgba(19,69,96,0.75)]"
          : "border-[#0c1a22]/[0.12] bg-white/65 text-ink hover:border-[#0c1a22]/25 hover:bg-white/90",
        className,
      )}
      {...props}
    />
  );
}
