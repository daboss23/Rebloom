import type { Metadata } from "next";
import Link from "next/link";
import { CaptureFlow } from "@/components/capture/CaptureFlow";
import { RescanProcessing } from "@/components/report/RescanProcessing";
import { ButtonLink } from "@/components/ui/Button";
import { IconArrowLeft } from "@/components/ui/Icons";
import { Label } from "@/components/ui/Typography";
import { loadReport } from "@/lib/report/load";

export const metadata: Metadata = { title: "Progress scan" };

/**
 * A progress scan (brief 3.1 step 9, DECISIONS D-073): the same capture and quality gate as the first scan, keyed by
 * the report link. With `?scan=`, it reads that photo and returns to the report, now the progress view.
 */
export default async function RescanPage({ params, searchParams }: PageProps<"/r/[token]/rescan">) {
  const { token } = await params;
  const scanId = (await searchParams).scan;
  const { client, clinic, scans } = await loadReport(token);

  if (client.demoKey) {
    return (
      <article className="pb-4 pt-8">
        <BackLink token={token} />
        <Label>Progress scan</Label>
        <h1 className="t-h1 focus-in mt-4 [text-wrap:balance]">This is a sample client.</h1>
        <p className="t-body mt-5">
          {client.firstName}&apos;s photo is an AI-generated stand-in, so a progress scan here would compare your face with
          theirs. Take your own scan, then come back to your report to try a progress scan.
        </p>
        <ButtonLink href={`/c/${clinic.slug}`} block className="mt-10 !min-h-14 text-[16px]">
          Take your own scan
        </ButtonLink>
      </article>
    );
  }

  if (typeof scanId === "string") return <RescanProcessing token={token} scanId={scanId} />;

  const first = scans[0].captureQuality;
  return (
    <div>
      <div className="pt-6">
        <BackLink token={token} />
      </div>
      <CaptureFlow clinicSlug={clinic.slug} rescan={{ token, baseline: first ? { luminance: first.luminance, warmth: first.warmth } : null }} />
    </div>
  );
}

function BackLink({ token }: { token: string }) {
  return (
    <Link href={`/r/${token}`} className="t-caption inline-flex min-h-11 items-center gap-2 !text-[13.5px] text-text-2 hover:text-ink">
      <IconArrowLeft width={16} height={16} />
      Your report
    </Link>
  );
}
