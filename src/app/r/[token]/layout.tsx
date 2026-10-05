import type { Metadata } from "next";
import { ClinicShell } from "@/components/flow/ClinicShell";
import { loadReport } from "@/lib/report/load";
import { isEphemeralStore } from "@/lib/store";

export async function generateMetadata({ params }: LayoutProps<"/r/[token]">): Promise<Metadata> {
  const { clinic } = await loadReport((await params).token);
  return { title: `Your skin report · ${clinic.name}`, robots: { index: false, follow: false } };
}

export default async function ReportLayout({ params, children }: LayoutProps<"/r/[token]">) {
  const { clinic } = await loadReport((await params).token);
  return (
    <ClinicShell clinic={clinic} section="Skin report" ephemeral={isEphemeralStore()}>
      {children}
    </ClinicShell>
  );
}
