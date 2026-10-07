"use client";

import { useEffect, useRef, useState } from "react";
import { LightField } from "@/components/dashboard/LightField";
import { Chip } from "@/components/ui/Chip";

export interface FaceMapLayer {
  key: string;
  label: string;
  describes: string;
  maskUrl: string | null;
}

/**
 * The client's photo with tappable concern overlays (brief 3.3: lead with their face). If the photo can't load
 * (a demo client before their portrait exists, D-030), it shows their initials over moving light, never a broken image.
 */
export function FaceMap({ photoUrl, initials, layers, caption }: { photoUrl: string; initials?: string; layers: FaceMapLayer[]; caption: string }) {
  const [active, setActive] = useState(layers[0]?.key ?? null);
  const current = layers.find((l) => l.key === active) ?? null;
  const [failed, setFailed] = useState(false);
  const img = useRef<HTMLImageElement>(null);
  // A photo that failed before the page hydrated never fires onError: check once on mount.
  useEffect(() => {
    if (img.current?.complete && img.current.naturalWidth === 0) setFailed(true);
  }, []);

  return (
    <div>
      <div className="relative aspect-[3/4] w-full overflow-hidden rounded-[24px] bg-mist shadow-[0_30px_60px_-32px_rgba(12,44,62,0.6)] ring-1 ring-white/70">
        {failed ? (
          <div aria-hidden className="absolute inset-0 grid place-items-center">
            <LightField variant="ice" />
            {initials && <span className="relative font-display text-[clamp(88px,22vw,140px)] font-light tracking-[0.04em] text-[#1e5a78]/70">{initials}</span>}
          </div>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- private, token-scoped image
          <img ref={img} src={photoUrl} alt="Your scan photo" onError={() => setFailed(true)} className="absolute inset-0 h-full w-full object-cover" />
        )}
        {layers.map((layer) =>
          layer.maskUrl && !failed ? (
            // Ice-white marks with a hairline deep-sea edge read on every skin tone.
            <div
              key={layer.key}
              aria-hidden
              className="absolute inset-0 transition-opacity duration-500 ease-gentle"
              style={{ opacity: layer.key === active ? 1 : 0, filter: "drop-shadow(0 0 1px rgba(12,26,34,0.6))" }}
            >
              <div
                className="absolute inset-0"
                style={{
                  backgroundColor: "#f6fbfd",
                  WebkitMaskImage: `url(${layer.maskUrl})`,
                  maskImage: `url(${layer.maskUrl})`,
                  WebkitMaskSize: "100% 100%",
                  maskSize: "100% 100%",
                }}
              />
            </div>
          ) : null,
        )}
        {current && (
          <span className="absolute right-3 top-3 rounded-full bg-white/85 px-3 py-1 text-[11px] uppercase tracking-[0.14em] text-ink shadow-[0_6px_16px_-10px_rgba(12,26,34,0.6)] backdrop-blur-sm">
            {current.label}
          </span>
        )}
        <span className="absolute bottom-3 left-3 text-[11px] uppercase tracking-[0.14em] text-white/95 drop-shadow-[0_1px_2px_rgba(0,0,0,0.45)]">
          {caption}
        </span>
      </div>
      <div role="group" aria-label="Show a concern on your photo" className="mt-4 grid grid-cols-3 gap-2">
        {layers.map((layer) => (
          <Chip key={layer.key} selected={layer.key === active} onClick={() => setActive(layer.key)} className="justify-center px-2 text-center">
            {layer.label}
          </Chip>
        ))}
      </div>
      {current && (
        <p key={current.key} className="t-body mt-4 fade">
          {current.describes}
        </p>
      )}
    </div>
  );
}
