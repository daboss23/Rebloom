import Link from "next/link";
import type { ReactNode } from "react";
import type { Clinic } from "@/lib/domain";
import { clinicThemeStyle } from "@/lib/brand";
import { ClinicWordmark, PoweredByRebloom } from "@/components/ui/Wordmarks";

/** Clinic-branded frame for every client-facing page: clinic header, Rebloom only in the footer. */
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
    <div style={clinicThemeStyle(clinic.accentHex)} className="min-h-dvh flex flex-col">
      {ephemeral && (
        <p className="bg-mist text-text-2 text-[12px] text-center px-4 py-2">
          Preview without a database. Data may reset between visits.
        </p>
      )}
      <header className="border-b border-mist">
        <div className="mx-auto max-w-[560px] px-5 h-16 flex items-center justify-between">
          <Link href={`/c/${clinic.slug}`} aria-label={`${clinic.name} home`}>
            <ClinicWordmark clinic={clinic} />
          </Link>
          {section && <span className="t-label">{section}</span>}
        </div>
      </header>
      <main className="flex-1 mx-auto w-full max-w-[560px] px-5">{children}</main>
      <footer className="mx-auto w-full max-w-[560px] px-5 pt-16 pb-10">
        <div className="border-t border-mist pt-6 flex flex-wrap items-center justify-between gap-4">
          <PoweredByRebloom />
          <nav className="flex gap-5 t-caption">
            <Link href="/privacy" className="underline underline-offset-4 decoration-1">
              Privacy
            </Link>
            <Link href="/terms" className="underline underline-offset-4 decoration-1">
              Terms
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
