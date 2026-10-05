import Link from "next/link";
import type { ReactNode } from "react";
import { Label } from "@/components/ui/Typography";
import { RebloomWordmark } from "@/components/ui/Wordmarks";

export function PolicyPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <div className="min-h-dvh">
      <header className="border-b border-mist">
        <div className="mx-auto max-w-[640px] px-5 h-16 flex items-center">
          <Link href="/" aria-label="Rebloom home">
            <RebloomWordmark />
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-[640px] px-5 pt-12 pb-20">
        <Label>Demo policy · Updated {updated}</Label>
        <h1 className="t-h1 mt-4">{title}</h1>
        <p className="mt-6 border border-mist px-4 py-3 t-caption">
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
