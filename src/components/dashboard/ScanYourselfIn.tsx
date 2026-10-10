import QRCode from "qrcode";
import Link from "next/link";
import { Bloom } from "@/components/dashboard/Bloom";
import { IconArrowRight } from "@/components/ui/Icons";

/** Modules of quiet margin around the code, as scanners expect. */
const QUIET = 2;

/**
 * Demo only (DECISIONS D-090): the way to see a scan arrive. A judge on a laptop points their phone at the code, takes
 * a scan as a new prospect, and lands in the dashboard they're looking at. The code carries this demo to the phone;
 * on a phone already, the link starts a scan right here.
 */
export function ScanYourselfIn({ url, clinic }: { url: string; clinic: { name: string; slug: string } }) {
  // High error correction leaves room for the bloom at the centre.
  const { modules } = QRCode.create(url, { errorCorrectionLevel: "H" });
  const size = modules.size;
  const box = size + QUIET * 2;
  let d = "";
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (modules.get(y, x)) d += `M${x + QUIET} ${y + QUIET}h1v1h-1z`;

  return (
    <section aria-labelledby="scan-in" className="glass focus-in overflow-hidden px-6 py-6" style={{ animationDelay: "120ms" }}>
      <p className="text-[0.75rem] uppercase tracking-[0.22em] text-[#1e5a78]">For judges</p>
      <h2 id="scan-in" className="mt-2 font-display text-[1.625rem] font-light leading-tight text-ink">
        Scan yourself in
      </h2>
      <p className="mt-2 text-[0.875rem] leading-relaxed text-text-2">
        About 2 minutes: a few questions about your skin and goals, then your photo. You&apos;ll arrive here as a new prospect for {clinic.name}.
      </p>
      <div className="mt-5 hidden flex-col items-center gap-4 sm:flex">
        <figure className="relative shrink-0 rounded-[16px] bg-white p-2.5 shadow-[0_14px_30px_-18px_rgba(12,44,62,0.45)] ring-1 ring-[#0c1a22]/[0.06]">
          <svg viewBox={`0 0 ${box} ${box}`} width={168} height={168} role="img" aria-label={`Code to scan yourself in to ${clinic.name} on your phone`} shapeRendering="crispEdges">
            <path d={d} fill="#0c1a22" />
          </svg>
          <span aria-hidden className="absolute left-1/2 top-1/2 grid h-9 w-9 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white">
            <Bloom size={22} className="text-[#b0802c]" />
          </span>
        </figure>
        <p className="max-w-[16rem] text-center text-[0.8125rem] leading-relaxed text-text-2">Point your phone&apos;s camera at the code to start. Your scan lands in this dashboard.</p>
      </div>
      <Link href={`/c/${clinic.slug}`} className="group mt-5 inline-flex min-h-11 items-center gap-2 text-[0.875rem] text-[#1e5a78] hover:text-ink">
        <span className="sm:hidden">Start a scan</span>
        <span className="hidden sm:inline">Or scan on this device</span>
        <IconArrowRight width={15} height={15} className="transition-transform duration-200 group-hover:translate-x-0.5" />
      </Link>
    </section>
  );
}
