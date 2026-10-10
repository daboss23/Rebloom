import { cx } from "@/components/ui/cx";
import { ClinicWordmark } from "@/components/ui/Wordmarks";
import type { Clinic } from "@/lib/domain";
import { clinicThemeStyle } from "@/lib/brand";

/**
 * A small picture of a clinic's scan page, as clients see it (DECISIONS D-061): Rebloom's light and glass,
 * the clinic's name, logo and accent. Still, with no live light, so a page can show several at once.
 * Built from spans, so it can sit inside a link.
 */
export function ClientPagePreview({ clinic, className }: { clinic: Pick<Clinic, "wordmark" | "wordmarkStyle" | "monogramUrl" | "name" | "accentHex">; className?: string }) {
  return (
    <span
      style={clinicThemeStyle(clinic.accentHex)}
      className={cx(
        "relative block overflow-hidden rounded-[18px] bg-[radial-gradient(90%_70%_at_100%_0%,rgba(255,210,191,0.6)_0%,rgba(255,210,191,0)_62%),linear-gradient(180deg,#f6fbfd_0%,#d9e9f1_100%)] px-6 pb-6 pt-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)] ring-1 ring-white/80",
        className,
      )}
    >
      <span className="flex h-8 items-center">
        <ClinicWordmark clinic={clinic} />
      </span>
      <span aria-hidden className="mt-9 block h-[2px] w-8 rounded-full bg-accent" />
      <span className="mt-3 block font-display text-[1.875rem] font-light leading-tight text-ink">See your skin clearly.</span>
      <span
        aria-hidden
        className="mt-5 inline-flex h-9 items-center rounded-[10px] bg-[linear-gradient(100deg,#c99645_0%,#f1d49a_45%,#d9ae62_70%,#b98a3c_100%)] px-4 text-[0.8125rem] text-[#1a1206] shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_8px_18px_-10px_rgba(201,150,69,0.8)]"
      >
        Begin
      </span>
    </span>
  );
}
