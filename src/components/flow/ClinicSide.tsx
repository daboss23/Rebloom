import { Bloom } from "@/components/dashboard/Bloom";
import { IconArrowRight } from "@/components/ui/Icons";
import { cx } from "@/components/ui/cx";

/**
 * Demo only (DECISIONS D-090): someone who just scanned themselves is now a client in the clinic's book, and can see
 * it from the clinic's side on whatever device they're holding. Rebloom's own deep sea and gold, set apart from the
 * clinic's page, because this is the platform speaking, not the clinic.
 */
export function ClinicSide({ href, clinicName, className }: { href: string; clinicName: string; className?: string }) {
  return (
    <aside aria-label="Rebloom demo" className={cx("sea on-dark relative overflow-hidden rounded-[22px] px-6 py-6 sm:px-7", className)}>
      <p className="flex items-center gap-2.5 text-[11px] uppercase tracking-[0.22em] text-[#e2c07a]">
        <Bloom size={15} className="text-[#e2c07a]" />
        Rebloom demo
      </p>
      <p className="mt-3 font-display text-[26px] font-light leading-[1.15] text-white [text-wrap:balance]">
        You&apos;re now a new prospect for {clinicName}.
      </p>
      <p className="mt-2 text-[14.5px] leading-relaxed text-[#cfe0e8]">See your scan the way the clinic does, on this device or any other.</p>
      {/* A plain link, not a prefetching one: opening it joins the demo's dashboard. */}
      <a href={href} className="btn-gold group mt-5 !h-12 gap-2 px-5">
        See it from the clinic&apos;s side
        <IconArrowRight width={16} height={16} className="transition-transform duration-200 group-hover:translate-x-0.5" />
      </a>
    </aside>
  );
}
