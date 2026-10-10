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
      <div aria-hidden className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_70%_65%_at_50%_50%,rgba(244,249,251,0.8)_0%,rgba(244,249,251,0.45)_55%,rgba(244,249,251,0.08)_100%)]" />

      {/* One centred composition: the story on the left, the way in on the right, on a shared 8px rhythm. */}
      <div className="relative mx-auto flex min-h-dvh w-full max-w-[1200px] flex-col px-6 sm:px-10">
        <header className="flex h-20 items-center justify-between">
          <Link href="/" className="group inline-flex items-center gap-2 text-[0.8125rem] text-text-2 hover:text-ink">
            <IconArrowLeft width={15} height={15} className="transition-transform duration-200 group-hover:-translate-x-0.5" />
            Rebloom home
          </Link>
          <span className="text-[0.6875rem] uppercase tracking-[0.22em] text-[#1e5a78]">Clinic dashboard</span>
        </header>

        <main className="grid flex-1 content-center items-center gap-12 pb-20 pt-4 lg:grid-cols-[minmax(0,1fr)_416px] lg:gap-16 lg:pb-24 xl:gap-24">
          <section className="focus-in mx-auto w-full max-w-[640px] lg:mx-0">
            <p className="flex items-center gap-2.5 text-[0.6875rem] uppercase tracking-[0.22em] text-[#9e4a5d]">
              <Bloom size={16} unfurl />
              Every client&apos;s next beginning
            </p>
            <h1 className="mt-6">
              <Image
                src="/brand/rebloom/rebloom-gold.webp"
                alt="Rebloom"
                width={1811}
                height={257}
                priority
                sizes="(min-width: 1024px) 640px, 92vw"
                className="h-auto w-full drop-shadow-[0_14px_30px_rgba(154,107,34,0.25)]"
              />
            </h1>
            <p className="mt-10 max-w-[34rem] font-display text-[clamp(26px,2.6vw,34px)] font-light leading-[1.2] text-ink">
              <span className="block">Everyone sells the scan.</span> <span className="block">Rebloom sells the result.</span>
            </p>
            <p className="mt-4 max-w-[30rem] text-[1rem] leading-relaxed text-text-2">
              Each morning, the clients whose skin is changing, and the ones who need a little care, each with the reason
              in one sentence.
            </p>
            <Pillars className="mt-12 hidden lg:grid" />
          </section>

          <section className="glass focus-in mx-auto w-full max-w-[26rem] p-8 sm:p-10 lg:mx-0" style={{ animationDelay: "180ms" }}>
            <p className="text-[0.6875rem] uppercase tracking-[0.22em] text-text-3">Demo clinic</p>
            <div className="mt-5">
              <ClinicWordmark clinic={MAISON_VERRE} />
            </div>
            <p className="t-caption mt-3">{MAISON_VERRE.address}</p>

            <div className="mt-8 border-t border-[#0c1a22]/[0.08] pt-8">
              <div className="flex items-center gap-4">
                <span aria-hidden className="grid h-12 w-12 place-items-center rounded-full bg-[linear-gradient(140deg,#ffe4d8,#f4b9a3_45%,#8fbfd6)] font-display text-[1.375rem] text-white [text-shadow:0_1px_2px_rgba(125,52,71,0.35)]">
                  {DANA.name[0]}
                </span>
                <span>
                  <span className="block text-[1rem] text-ink">{DANA.name}</span>
                  <span className="block text-[0.8125rem] text-text-3">{DANA.title}</span>
                </span>
              </div>
              <p className="mt-5 text-[0.90625rem] leading-relaxed text-text-2">
                Twelve demo clients, laid out around today. Send, confirm and move the clock freely: everything stays in
                this browser.
              </p>
              <form action={enterDemo} className="mt-8">
                <button type="submit" className="btn-gold group w-full gap-2.5 !h-14 px-6 text-[1rem]">
                  Enter demo as {DANA.name}
                  <IconArrowRight width={18} height={18} className="transition-transform duration-300 ease-out group-hover:translate-x-1" />
                </button>
              </form>
              <p className="t-caption mt-5 !text-[0.75rem]">Clinic sign-in by email arrives at launch.</p>
            </div>
          </section>

          {/* On small screens the way in comes first; the three promises follow it. */}
          <Pillars className="grid lg:hidden" />
        </main>
      </div>
    </div>
  );
}

/** Three short promises under the logo. */
function Pillars({ className }: { className: string }) {
  return (
    <dl className={`grid-cols-3 gap-3 sm:gap-4 ${className}`}>
      {[
        ["Measured", "on raw scan data"],
        ["Explained", "in one sentence"],
        ["Sent", "only after you read it"],
      ].map(([term, detail], i) => (
        <div key={term} className="glass focus-in min-w-0 px-3 py-4 sm:px-5 sm:py-5" style={{ animationDelay: `${300 + i * 90}ms` }}>
          <dt className="font-display text-[1.1875rem] font-light text-ink sm:text-[1.5rem]">{term}</dt>
          <dd className="mt-1.5 text-[0.78125rem] leading-snug text-text-3">{detail}</dd>
        </div>
      ))}
    </dl>
  );
}
