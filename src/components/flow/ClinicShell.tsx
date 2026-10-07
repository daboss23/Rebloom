import Link from "next/link";
import type { ReactNode } from "react";
import type { Clinic } from "@/lib/domain";
import { clinicThemeStyle } from "@/lib/brand";
import { ClinicWordmark, PoweredByRebloom } from "@/components/ui/Wordmarks";
import { ShellLight } from "./ShellLight";

/**
 * The frame for every client-facing page (DECISIONS D-061): Rebloom's light, glass and gold, wearing the
 * clinic's own name, logo and accent. Rebloom itself is one small line in the footer (D-001).
 */
export function ClinicShell({
  clinic,
  section,
  children,
  ephemeral,
}: {
  clinic: Clinic;
  section?: string;
  children: ReactNode;
  ephemeral?: boolean;
}) {
  return (
    <div style={clinicThemeStyle(clinic.accentHex)} className="rebloom client relative flex min-h-dvh flex-col overflow-x-clip">
      <ShellLight />
      {ephemeral && (
        <p className="relative bg-white/70 px-4 py-2 text-center text-[12px] text-text-2">
          Preview without a database. Data may reset between visits.
        </p>
      )}
      <header className="sticky top-0 z-30 border-b border-white/70 bg-white/75 backdrop-blur-xl backdrop-saturate-150">
        <div className="mx-auto flex h-16 max-w-[600px] items-center justify-between px-5">
          <Link href={`/c/${clinic.slug}`} aria-label={`${clinic.name} home`}>
            <ClinicWordmark clinic={clinic} />
          </Link>
          {/* On the narrowest phones the clinic's name needs the whole bar. */}
          {section && <span className="whitespace-nowrap text-[11px] uppercase tracking-[0.22em] text-[#1e5a78] max-[359px]:hidden">{section}</span>}
        </div>
      </header>
      <main className="relative mx-auto w-full max-w-[600px] flex-1 px-5">{children}</main>
      <footer className="relative mx-auto w-full max-w-[600px] px-5 pb-10 pt-16">
        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-[#0c1a22]/[0.08] pt-6">
          <PoweredByRebloom />
          <nav className="t-caption flex gap-5">
            <Link href="/privacy" className="underline decoration-[#0c1a22]/25 decoration-1 underline-offset-4 hover:text-ink">
              Privacy
            </Link>
            <Link href="/terms" className="underline decoration-[#0c1a22]/25 decoration-1 underline-offset-4 hover:text-ink">
              Terms
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
