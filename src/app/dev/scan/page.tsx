import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { demoFace } from "@/lib/demo/landmarks";
import { ScanPreview } from "./ScanPreview";

export const metadata: Metadata = { title: "Scan · Rebloom", robots: { index: false } };

/** The "reading your photo" scan on a demo portrait, to tune it without the camera. Hidden on the production deploy. */
export default async function ScanPreviewPage({ searchParams }: PageProps<"/dev/scan">) {
  if (process.env.VERCEL_ENV === "production") notFound();
  const who = String((await searchParams).who ?? "amelia");
  const points = demoFace(who);
  return (
    <main className="mx-auto max-w-[560px] px-5 py-10">
      <ScanPreview photo={points ? `/demo-portraits/${who}.jpg` : null} points={points?.slice(0, 468) ?? null} />
    </main>
  );
}
