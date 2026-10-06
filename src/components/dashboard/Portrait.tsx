"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The client's scan photo. Demo portraits are still to come (DECISIONS D-030), so until the file exists this
 * shows a quiet ice-mist block with their initials instead of a broken image.
 */
export function Portrait({ src, initials, caption }: { src: string | null; initials: string; caption: string }) {
  const [failed, setFailed] = useState(false);
  const img = useRef<HTMLImageElement>(null);
  // A photo that failed before the page hydrated never fires onError: check once on mount.
  useEffect(() => {
    if (img.current?.complete && img.current.naturalWidth === 0) setFailed(true);
  }, []);
  return (
    <div className="relative aspect-[4/5] w-full overflow-hidden bg-mist">
      {src && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element -- private, token-scoped photo
        <img ref={img} src={src} alt="Scan photo" onError={() => setFailed(true)} className="fade absolute inset-0 h-full w-full object-cover" />
      ) : (
        <div aria-hidden className="absolute inset-0 grid place-items-center">
          <span className="font-display text-[88px] font-light tracking-[0.04em] text-[color:var(--detail)]">{initials}</span>
        </div>
      )}
      <span className="t-label absolute bottom-4 left-4 !text-[10.5px]">{caption}</span>
    </div>
  );
}
