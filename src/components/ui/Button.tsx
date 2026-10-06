import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cx } from "./cx";

export type ButtonVariant = "primary" | "onDark" | "secondary" | "secondaryOnDark" | "quiet" | "danger";

// Rebloom's buttons (DECISIONS D-058, D-061): gold for the one thing to do next, glass for the rest.
const base =
  "inline-flex items-center justify-center gap-2 min-h-12 rounded-[14px] px-6 text-[15px] font-normal tracking-[0.01em] select-none " +
  "transition-[background-color,color,border-color,opacity,transform,filter] duration-200 ease-out active:scale-[0.98] " +
  "disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100 aria-disabled:opacity-40 aria-disabled:pointer-events-none";

const gold =
  "text-[#1a1206] bg-[linear-gradient(100deg,#c99645_0%,#f1d49a_45%,#d9ae62_70%,#b98a3c_100%)] " +
  "shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_12px_26px_-14px_rgba(201,150,69,0.8)] hover:brightness-[1.06]";

const variants: Record<ButtonVariant, string> = {
  primary: gold,
  onDark: gold,
  secondary: "border border-[#0c1a22]/[0.14] bg-white/60 text-ink backdrop-blur-sm hover:border-[#0c1a22]/25 hover:bg-white/90",
  secondaryOnDark: "border border-white/25 text-white hover:border-white/45 hover:bg-white/10",
  quiet: "min-h-11 rounded-none px-1 text-ink underline underline-offset-4 decoration-1 hover:decoration-2 active:scale-100",
  // The one action that can't be undone: deep ink, never gold.
  danger: "bg-ink text-white hover:bg-[#1b2c36]",
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
