import type { ComponentProps, ElementType, ReactNode } from "react";
import { cx } from "./cx";

export function Label({ as: Tag = "p", className, ...props }: { as?: ElementType } & ComponentProps<"p">) {
  return <Tag className={cx("t-label", className)} {...props} />;
}

export function Hairline({ className, dark }: { className?: string; dark?: boolean }) {
  return <hr className={cx("border-0 h-px", dark ? "bg-white/15" : "bg-mist", className)} />;
}

/** Big thin serif number with a small "/100". Numbers in thin serif look premium (brief 7.4). */
export function ScoreNumber({ value, size = "lg", className }: { value: number; size?: "lg" | "md"; className?: string }) {
  return (
    <span className={cx("inline-flex items-baseline", className)}>
      <span className={cx("t-score", size === "md" && "!text-[30px]")}>{Math.round(value)}</span>
      {size === "lg" && <span className="ml-1 text-[12px] text-text-3">/100</span>}
    </span>
  );
}

/** 2px bar: mist track, accent fill. */
export function ScoreBar({ value, className, label }: { value: number; className?: string; label?: string }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div
      className={cx("h-[2px] w-full bg-mist", className)}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <div className="h-full bg-accent transition-[width] duration-700 ease-gentle" style={{ width: `${v}%` }} />
    </div>
  );
}

/** Mist block with a small uppercase caption (brief 7.5, photography placeholders). */
export function ImagePlaceholder({ caption, className, children }: { caption: string; className?: string; children?: ReactNode }) {
  return (
    <div className={cx("relative bg-mist", className)}>
      {children}
      <span className="t-label absolute bottom-3 left-3">{caption}</span>
    </div>
  );
}
