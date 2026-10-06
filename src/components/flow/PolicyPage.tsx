import Link from "next/link";
import type { ReactNode } from "react";
import { Label } from "@/components/ui/Typography";
import { RebloomWordmark } from "@/components/ui/Wordmarks";

export function PolicyPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <div className="rebloom min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-white/70 bg-white/80 backdrop-blur-xl backdrop-saturate-150">
        <div className="mx-auto flex h-16 max-w-[680px] items-center px-5">
          <Link href="/" aria-label="Rebloom home">
            <RebloomWordmark height={18} />
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-[680px] px-5 pb-20 pt-12">
        <Label>Demo policy · Updated {updated}</Label>
        <h1 className="t-h1 mt-4">{title}</h1>
        <p className="t-caption mt-6 rounded-[14px] bg-white/60 px-4 py-3 ring-1 ring-inset ring-[#0c1a22]/[0.07]">
          Rebloom is a demo built for a hackathon. Maison Verre and Tidewater Skin Studio are fictional clinics. This page
          explains how the demo treats your data, in plain English. It is not legal advice.
        </p>
        <div className="mt-10 space-y-8 [&_h2]:t-h3 [&_h2]:mb-2 [&_p]:t-body [&_li]:t-body [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1">
          {children}
        </div>
      </main>
    </div>
  );
}
