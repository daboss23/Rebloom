import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { enterDemo } from "@/app/dashboard/actions";
import { Bloom } from "@/components/dashboard/Bloom";
import { LightField } from "@/components/dashboard/LightField";
import { IconArrowLeft, IconArrowRight } from "@/components/ui/Icons";
import { ClinicWordmark } from "@/components/ui/Wordmarks";
import { MAISON_VERRE } from "@/data/clinics";
import { DANA } from "@/data/staff";
import { readSession } from "@/lib/dashboard/session";

export const metadata: Metadata = {
  title: "Sign in · Rebloom",
  robots: { index: false, follow: false },
};

/** The door to the clinic dashboard: morning light on water, the gold logo, and one way in (brief 3.2). */
export default async function EnterPage() {
  if (await readSession()) redirect("/dashboard");

  return (
    <div className="rebloom relative min-h-dvh overflow-hidden">
      <div aria-hidden className="pointer-events-none fixed inset-0">
        <LightField variant="ice" />
      </div>
      <div aria-hidden className="pointer-events-none fixed inset-0 bg-[linear-gradient(100deg,rgba(244,249,251,0.82)_0%,rgba(244,249,251,0.45)_45%,rgba(244,249,251,0.05)_100%)]" />

      <div className="relative flex min-h-dvh flex-col">
        <header className="flex h-16 items-center justify-between px-6 sm:px-10">
          <Link href="/" className="group inline-flex items-center gap-2 text-[13px] text-text-2 hover:text-ink">
            <IconArrowLeft width={15} height={15} className="transition-transform duration-200 group-hover:-translate-x-0.5" />
            Rebloom home
          </Link>
          <span className="text-[11px] uppercase tracking-[0.22em] text-[#1e5a78]">Clinic dashboard</span>
        </header>

        <main className="grid flex-1 items-center gap-12 px-6 pb-16 pt-6 sm:px-10 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,26rem)] lg:gap-20 lg:pb-24">
          <section className="focus-in">
            <p className="flex items-center gap-2.5 text-[11px] uppercase tracking-[0.22em] text-[#9e4a5d]">
              <Bloom size={16} unfurl />
              Every client&apos;s next beginning
            </p>
            <h1 className="mt-8">
              <Image
                src="/brand/rebloom/rebloom-gold.webp"
                alt="Rebloom"
                width={1811}
                height={257}
                priority
                sizes="(min-width: 1024px) 760px, 92vw"
                className="h-auto w-full max-w-[760px] drop-shadow-[0_14px_30px_rgba(154,107,34,0.25)]"
              />
            </h1>
            <p className="mt-10 max-w-lg font-display text-[clamp(26px,2.8vw,36px)] font-light leading-[1.2] text-ink">
              Everyone sells the scan. Rebloom sells the second visit.
            </p>
            <p className="mt-4 max-w-md text-[16px] leading-relaxed text-text-2">
              Each morning, the clients whose skin is changing, and the ones who need a little care, each with the reason
              in one sentence.
            </p>
            <dl className="mt-12 grid max-w-xl grid-cols-3 gap-3">
              {[
                ["Measured", "on raw scan data"],
                ["Explained", "in one sentence"],
                ["Sent", "only after you read it"],
              ].map(([term, detail], i) => (
                <div key={term} className="glass focus-in min-w-0 px-3 py-4 sm:px-4" style={{ animationDelay: `${300 + i * 90}ms` }}>
                  <dt className="font-display text-[19px] font-light text-ink sm:text-[24px]">{term}</dt>
                  <dd className="mt-1 text-[12.5px] text-text-3">{detail}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="glass focus-in p-8 sm:p-10" style={{ animationDelay: "180ms" }}>
            <p className="text-[11px] uppercase tracking-[0.22em] text-text-3">Demo clinic</p>
            <div className="mt-5">
              <ClinicWordmark clinic={MAISON_VERRE} />
            </div>
            <p className="t-caption mt-3">{MAISON_VERRE.address}</p>

            <div className="mt-8 border-t border-[#0c1a22]/[0.08] pt-8">
              <div className="flex items-center gap-4">
                <span aria-hidden className="grid h-12 w-12 place-items-center rounded-full bg-[linear-gradient(140deg,#ffe4d8,#f4b9a3_45%,#8fbfd6)] font-display text-[22px] text-white [text-shadow:0_1px_2px_rgba(125,52,71,0.35)]">
                  {DANA.name[0]}
                </span>
                <span>
                  <span className="block text-[16px] text-ink">{DANA.name}</span>
                  <span className="block text-[13px] text-text-3">{DANA.title}</span>
                </span>
              </div>
              <p className="mt-5 text-[14.5px] leading-relaxed text-text-2">
                Twelve demo clients, laid out around today. Send, confirm and move the clock freely: everything stays in
                this browser.
              </p>
              <form action={enterDemo} className="mt-8">
                <button type="submit" className="btn-gold group w-full justify-between !h-14 px-6 text-[16px]">
                  Enter demo as {DANA.name}
                  <IconArrowRight width={18} height={18} className="transition-transform duration-300 ease-out group-hover:translate-x-1" />
                </button>
              </form>
              <p className="t-caption mt-5 !text-[12px]">Clinic sign-in by email arrives at launch.</p>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
