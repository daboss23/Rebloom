"use client";

import { useState } from "react";
import { cx } from "@/components/ui/cx";

export interface FaceMapLayer {
  key: string;
  label: string;
  describes: string;
  maskUrl: string | null;
}

/** The client's photo with tappable concern overlays (brief 3.3: lead with their face). */
export function FaceMap({ photoUrl, layers, caption }: { photoUrl: string; layers: FaceMapLayer[]; caption: string }) {
  const [active, setActive] = useState(layers[0]?.key ?? null);
  const current = layers.find((l) => l.key === active) ?? null;

  return (
    <div>
      <div className="relative aspect-[3/4] w-full overflow-hidden bg-mist">
        {/* eslint-disable-next-line @next/next/no-img-element -- private, token-scoped image */}
        <img src={photoUrl} alt="Your scan photo" className="absolute inset-0 h-full w-full object-cover" />
        {layers.map((layer) =>
          layer.maskUrl ? (
            // Porcelain marks with a hairline ink edge read on every skin tone.
            <div
              key={layer.key}
              aria-hidden
              className="absolute inset-0 transition-opacity duration-500 ease-gentle"
              style={{ opacity: layer.key === active ? 1 : 0, filter: "drop-shadow(0 0 1px rgba(28,28,26,0.55))" }}
            >
              <div
                className="absolute inset-0"
                style={{
                  backgroundColor: "#F7F4EF",
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
          <span className="absolute right-3 top-3 t-label !text-ink bg-porcelain/90 px-2 py-1">{current.label}</span>
        )}
        <span className="absolute left-3 bottom-3 t-label !text-porcelain/90 mix-blend-normal drop-shadow-[0_1px_1px_rgba(0,0,0,0.35)]">
          {caption}
        </span>
      </div>
      <div role="group" aria-label="Show a concern on your photo" className="mt-4 grid grid-cols-3 gap-2">
        {layers.map((layer) => (
          <button
            key={layer.key}
            type="button"
            aria-pressed={layer.key === active}
            onClick={() => setActive(layer.key)}
            className={cx(
              "min-h-11 px-2 border text-[14px] transition-colors duration-300",
              layer.key === active ? "bg-ink border-ink text-porcelain" : "border-ink text-ink",
            )}
          >
            {layer.label}
          </button>
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
