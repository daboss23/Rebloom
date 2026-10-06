import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { enterDemo } from "@/app/dashboard/actions";
import { IconArrowLeft, IconArrowRight } from "@/components/ui/Icons";
import { ClinicWordmark } from "@/components/ui/Wordmarks";
import { MAISON_VERRE } from "@/data/clinics";
import { DANA } from "@/data/staff";
import { readSession } from "@/lib/dashboard/session";

export const metadata: Metadata = {
  title: "Sign in · Rebloom",
  robots: { index: false, follow: false },
};

/** The door to the clinic dashboard. For now, one way in: the demo, as Dana (brief 3.2). */
export default async function EnterPage() {
  if (await readSession()) redirect("/dashboard");

  return (
    <div className="rebloom min-h-dvh flex flex-col">
      <header className="px-6 sm:px-10 h-16 flex items-center justify-between border-b border-mist">
        <Link href="/" className="group inline-flex items-center gap-2 text-[13px] text-text-3 hover:text-ink">
          <IconArrowLeft width={15} height={15} className="transition-transform duration-200 group-hover:-translate-x-0.5" />
          Rebloom home
        </Link>
        <span className="t-label">Clinic dashboard</span>
      </header>

      <main className="flex-1 grid lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <section className="relative overflow-hidden px-6 sm:px-10 pt-16 pb-12 lg:py-24 flex flex-col justify-between">
          <div className="reveal">
            <p className="t-label">Who to contact today, and why</p>
            <h1 className="mt-8">
              <Image
                src="/brand/rebloom/rebloom-gold.webp"
                alt="Rebloom"
                width={1811}
                height={257}
                priority
                sizes="(min-width: 1024px) 720px, 92vw"
                className="h-auto w-full max-w-[720px]"
              />
            </h1>
            <p className="mt-8 max-w-md text-[17px] leading-relaxed text-text-2">
              Everyone sells the scan. Rebloom sells the second visit. Each morning, one quiet list of the clients
              worth a message, with the reason in one sentence.
            </p>
          </div>
          <dl className="mt-16 grid grid-cols-3 gap-6 max-w-lg border-t border-mist pt-6">
            {[
              ["Measured", "on raw scan data"],
              ["Explained", "in one sentence"],
              ["Sent", "only after you read it"],
            ].map(([term, detail]) => (
              <div key={term}>
                <dt className="font-display text-[22px] font-light text-ink">{term}</dt>
                <dd className="t-caption mt-1">{detail}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="border-t lg:border-t-0 lg:border-l border-mist bg-panel px-6 sm:px-10 py-12 lg:py-24 flex items-center">
          <div className="w-full max-w-sm mx-auto rise">
            <p className="t-label">Demo clinic</p>
            <div className="mt-5">
              <ClinicWordmark clinic={MAISON_VERRE} />
            </div>
            <p className="t-caption mt-3">{MAISON_VERRE.address}</p>

            <div className="mt-10 border-t border-mist pt-8">
              <p className="text-[15px] text-ink">
                Sign in as {DANA.name}, {DANA.title.toLowerCase()}.
              </p>
              <p className="t-body mt-2 !text-[14px]">
                Twelve demo clients, laid out around today. Send, confirm and move the clock freely: everything stays in
                this browser.
              </p>
              <form action={enterDemo} className="mt-8">
                <button
                  type="submit"
                  className="group w-full inline-flex items-center justify-between gap-3 min-h-14 px-6 bg-ink text-porcelain text-[15px] transition-[background-color,transform] duration-200 ease-out hover:bg-[#2a3035] active:scale-[0.99]"
                >
                  Enter demo as {DANA.name}
                  <IconArrowRight width={18} height={18} className="transition-transform duration-300 ease-out group-hover:translate-x-1" />
                </button>
              </form>
              <p className="t-caption mt-5 !text-[12px]">Clinic sign-in by email arrives at launch.</p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
