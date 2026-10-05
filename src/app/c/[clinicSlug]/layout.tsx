import type { Metadata } from "next";
import { ClinicShell } from "@/components/flow/ClinicShell";
import { loadClinic } from "@/lib/flow/load";
import { isEphemeralStore } from "@/lib/store";

export async function generateMetadata({ params }: LayoutProps<"/c/[clinicSlug]">): Promise<Metadata> {
  const clinic = await loadClinic((await params).clinicSlug);
  return {
    title: `${clinic.name} · Skin scan`,
    description: `See your skin clearly. A private skin report from ${clinic.name}, ${clinic.city}.`,
  };
}

export default async function ClinicLayout({ params, children }: LayoutProps<"/c/[clinicSlug]">) {
  const clinic = await loadClinic((await params).clinicSlug);
  return (
    <ClinicShell clinic={clinic} section="Skin scan" ephemeral={isEphemeralStore()}>
      {children}
    </ClinicShell>
  );
}
