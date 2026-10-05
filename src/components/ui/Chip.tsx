"use client";
import type { ComponentProps } from "react";
import { cx } from "./cx";

/** Toggle chip for intake answers. 44px tall, 1px ink border, selected = ink fill. */
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
        "min-h-11 px-4 border text-[14px] leading-tight text-left transition-colors duration-300 ease-gentle",
        selected ? "bg-ink border-ink text-porcelain" : "border-ink text-ink hover:bg-ink/[0.04]",
        className,
      )}
      {...props}
    />
  );
}
