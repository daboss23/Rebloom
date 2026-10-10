import Link from "next/link";
import type { ReactNode } from "react";
import { Label } from "@/components/ui/Typography";
import { RebloomWordmark } from "@/components/ui/Wordmarks";

/** Privacy and terms: Rebloom's own pages, so they wear its black bar and deep footer, like the landing page. */
export function PolicyPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <div className="rebloom flex min-h-dvh flex-col">
      <header className="on-dark sticky top-0 z-30 border-b border-white/10 bg-black/90 backdrop-blur-xl backdrop-saturate-150">
        <div className="mx-auto flex h-16 max-w-[680px] items-center justify-center px-5 lg:h-[72px]">
          <Link href="/" aria-label="Rebloom home">
            <RebloomWordmark height={22} className="!h-[19px] sm:!h-[22px]" shine />
          </Link>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[680px] flex-1 px-5 pb-20 pt-12">
        {/* The title block sits on the logo's centre line; the reading below stays left-aligned. */}
        <div className="text-center">
          <Label>Demo policy · Updated {updated}</Label>
          <h1 className="t-h1 mt-4">{title}</h1>
        </div>
        <p className="t-caption mt-6 rounded-[14px] bg-white/60 px-4 py-3 text-center ring-1 ring-inset ring-[#0c1a22]/[0.07]">
          Rebloom is a demo built for a hackathon. Maison Verre and Tidewater Skin Studio are fictional clinics. This page
          explains how the demo treats your data, in plain English. It is not legal advice.
        </p>
        <div className="mt-12 space-y-10 [&_h2]:mb-3 [&_h2]:font-display [&_h2]:text-[1.75rem] [&_h2]:font-light [&_h2]:leading-tight [&_h2]:text-ink [&_li]:t-body [&_li]:marker:text-[#c99645] [&_p]:t-body [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5">
          {children}
        </div>
      </main>
      <footer className="footer-deep on-dark">
        <div className="mx-auto flex max-w-[680px] flex-wrap items-center justify-between gap-4 px-5 py-8">
          <RebloomWordmark height={15} className="logo-on-deep" />
          <nav aria-label="Legal" className="flex gap-6 text-[0.8125rem]">
            <Link href="/privacy" className="underline underline-offset-4">
              Privacy
            </Link>
            <Link href="/terms" className="underline underline-offset-4">
              Terms
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
