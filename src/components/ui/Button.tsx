import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cx } from "./cx";

export type ButtonVariant = "primary" | "onDark" | "secondary" | "secondaryOnDark" | "quiet";

const base =
  "inline-flex items-center justify-center gap-2 min-h-12 px-6 text-[15px] font-normal tracking-[0.01em] " +
  "transition-[background-color,color,border-color,opacity] duration-300 ease-gentle select-none " +
  "disabled:opacity-40 disabled:cursor-not-allowed aria-disabled:opacity-40 aria-disabled:pointer-events-none";

const variants: Record<ButtonVariant, string> = {
  primary: "bg-ink text-porcelain hover:bg-[#33332f]",
  onDark: "bg-accent text-on-accent hover:opacity-90",
  secondary: "border border-ink text-ink hover:bg-ink/[0.04]",
  secondaryOnDark: "border border-ink-soft/50 text-porcelain hover:border-ink-soft",
  quiet: "min-h-11 px-1 text-ink underline underline-offset-4 decoration-1 hover:decoration-2",
};

interface Common {
  variant?: ButtonVariant;
  block?: boolean;
  children: ReactNode;
}

export function Button({ variant = "primary", block, className, ...props }: Common & ComponentProps<"button">) {
  return <button className={cx(base, variants[variant], block && "w-full", className)} {...props} />;
}

export function ButtonLink({
  variant = "primary",
  block,
  className,
  ...props
}: Common & ComponentProps<typeof Link>) {
  return <Link className={cx(base, variants[variant], block && "w-full", className)} {...props} />;
}
