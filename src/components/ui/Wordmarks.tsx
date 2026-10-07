import Image from "next/image";
import type { Clinic } from "@/lib/domain";
import { cx } from "./cx";

/**
 * The clinic's mark: monogram image plus live-text wordmark (brief 7.2).
 * Clinics without a monogram get a small accent dot instead.
 */
export function ClinicWordmark({ clinic, className }: { clinic: Pick<Clinic, "wordmark" | "wordmarkStyle" | "monogramUrl" | "name">; className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-3", className)}>
      {clinic.monogramUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- small static brand mark, already optimised
        <img src={clinic.monogramUrl} alt="" width={39} height={30} className="h-[30px] w-auto" />
      ) : (
        <span aria-hidden className="block h-[9px] w-[9px] rounded-full bg-accent" />
      )}
      <span
        className={cx(
          "text-ink whitespace-nowrap",
          clinic.wordmarkStyle === "serif"
            ? "font-display font-medium text-[16px] tracking-[0.32em]"
            : "font-sans font-medium text-[13px] tracking-[0.3em]",
        )}
      >
        <span className="sr-only">{clinic.name}</span>
        <span aria-hidden>{clinic.wordmark}</span>
      </span>
    </span>
  );
}

/** Intrinsic size of the trimmed logo files in public/brand/rebloom. */
const REBLOOM_LOGO = { gold: { w: 1811, h: 257 }, cream: { w: 1805, h: 243 } } as const;

/**
 * Rebloom's logo (DECISIONS D-057). Gold on light surfaces; the flat cream version on charcoal, where gold's
 * shading would muddy. `height` is the rendered cap-to-baseline box in pixels. `shine` sends a slow glint of light
 * across the gold letters every few seconds (globals.css, `.logo-shine`); it holds still when motion is unwelcome.
 */
export function RebloomWordmark({
  className,
  onDark,
  height = 20,
  shine,
}: {
  className?: string;
  onDark?: boolean;
  height?: number;
  shine?: boolean;
}) {
  const variant = onDark ? "cream" : "gold";
  const { w, h } = REBLOOM_LOGO[variant];
  const logo = (
    <Image
      src={`/brand/rebloom/rebloom-${variant}.webp`}
      alt="Rebloom"
      width={w}
      height={h}
      sizes={`${Math.ceil((height * w) / h)}px`}
      className={cx("inline-block w-auto select-none", className)}
      style={{ height }}
      draggable={false}
    />
  );
  if (!shine || onDark) return logo;
  return (
    <span className="logo-shine">
      {logo}
      <span aria-hidden className="logo-shine-light" />
    </span>
  );
}

/** The one place Rebloom appears on a clinic's pages (DECISIONS D-001): a small line with the gold logo. */
export function PoweredByRebloom({ className }: { className?: string }) {
  return (
    <p className={cx("t-caption inline-flex items-center gap-2", className)}>
      Powered by <RebloomWordmark height={11} className="translate-y-px" />
    </p>
  );
}
