"use client";

import { useEffect, useRef, useState } from "react";
import { LightField } from "./LightField";

/**
 * The client's scan photo. Demo portraits are still to come (DECISIONS D-030), so until the file exists this
 * shows their initials over moving light instead of a broken image.
 */
export function Portrait({ src, initials, caption }: { src: string | null; initials: string; caption: string }) {
  const [failed, setFailed] = useState(false);
  const img = useRef<HTMLImageElement>(null);
  // A photo that failed before the page hydrated never fires onError: check once on mount.
  useEffect(() => {
    if (img.current?.complete && img.current.naturalWidth === 0) setFailed(true);
  }, []);
  return (
    <div className="relative aspect-[4/5] w-full overflow-hidden rounded-[16px] ring-1 ring-white/80 shadow-[0_24px_40px_-26px_rgba(12,44,62,0.6)]">
      {src && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element -- private, token-scoped photo
        <img ref={img} src={src} alt="Scan photo" onError={() => setFailed(true)} className="fade absolute inset-0 h-full w-full object-cover" />
      ) : (
        <div aria-hidden className="absolute inset-0 grid place-items-center">
          <LightField variant="ice" />
          <span className="relative font-display text-[6.5rem] font-light tracking-[0.04em] text-[#1e5a78]/70">{initials}</span>
        </div>
      )}
      {/* A soft fall of shade at the foot, so the caption sits on the photo rather than over a face. */}
      {src && !failed && <span aria-hidden className="fade pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-[linear-gradient(180deg,transparent,rgba(12,26,34,0.28))]" />}
      <span className="absolute bottom-4 left-4 rounded-full bg-white/75 px-3 py-1 text-[0.75rem] uppercase tracking-[0.14em] text-text-2 backdrop-blur">{caption}</span>
    </div>
  );
}
