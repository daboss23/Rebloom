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

/** Rebloom's text wordmark, until a logo arrives (DECISIONS D-001). */
export function RebloomWordmark({ className, onDark }: { className?: string; onDark?: boolean }) {
  return (
    <span
      className={cx(
        "font-display font-medium text-[24px] leading-none tracking-[0.01em]",
        onDark ? "text-porcelain" : "text-ink",
        className,
      )}
    >
      Rebloom
    </span>
  );
}

export function PoweredByRebloom({ className }: { className?: string }) {
  return (
    <p className={cx("t-caption", className)}>
      Powered by <span className="font-display text-[15px] text-ink">Rebloom</span>
    </p>
  );
}
