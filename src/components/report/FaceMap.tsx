"use client";

import Link from "next/link";
import { createContext, use, useEffect, useRef, useState, type ReactNode } from "react";
import { LightField } from "@/components/dashboard/LightField";
import { Chip } from "@/components/ui/Chip";
import { cx } from "@/components/ui/cx";

export interface FaceMapLayer {
  key: string;
  label: string;
  describes: string;
  /** The concern's score, 1 to 100. */
  score: number;
  maskUrl: string | null;
}

/** The priority the face map is showing, shared with the priority cards so the two read as one. */
const Shown = createContext<{ shown: string | null; show: (key: string) => void } | null>(null);

export function FaceMapFocus({ initial, children }: { initial: string | null; children: ReactNode }) {
  const [shown, show] = useState(initial);
  return <Shown value={{ shown, show }}>{children}</Shown>;
}

/** A priority card, outlined in sea while the face map shows it. Its parent sets the position. */
export function FaceMapPriority({ concern, className, children }: { concern: string; className?: string; children: ReactNode }) {
  const shown = use(Shown)?.shown === concern;
  return (
    <li className={className}>
      <span
        aria-hidden
        className={cx(
          "pointer-events-none absolute -inset-px rounded-[inherit] ring-1 ring-inset ring-[#1e5a78]/45 transition-opacity duration-500 ease-gentle",
          shown ? "opacity-100" : "opacity-0",
        )}
      />
      {children}
    </li>
  );
}

/**
 * The client's photo with tappable concern overlays (brief 3.3: lead with their face). Each button shows that
 * priority's marks and score on the photo. Demo clients' portraits were never scanned, so they carry no masks (D-030):
 * there only the score changes, and `scanHref` lets a judge take their own scan to see the marks (D-069).
 * If the photo can't load, it shows their initials over moving light, never a broken image.
 */
export function FaceMap({
  photoUrl,
  initials,
  layers,
  caption,
  scanHref,
}: {
  photoUrl: string;
  initials?: string;
  layers: FaceMapLayer[];
  caption: string;
  /** Set for demo clients: where to take a real scan. */
  scanHref?: string;
}) {
  const focus = use(Shown);
  const [own, setOwn] = useState(layers[0]?.key ?? null);
  const active = focus ? focus.shown : own;
  const setActive = focus ? focus.show : setOwn;
  const current = layers.find((l) => l.key === active) ?? null;
  const [failed, setFailed] = useState(false);
  const marked = !failed && layers.some((l) => l.maskUrl);
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
          <span
            aria-hidden
            className="absolute right-3 top-3 rounded-full bg-white/85 py-1.5 pl-3 pr-3.5 shadow-[0_6px_16px_-10px_rgba(12,26,34,0.6)] backdrop-blur-sm"
          >
            <span key={current.key} className="fade flex items-baseline gap-2 text-ink">
              <span className="text-[11px] uppercase tracking-[0.14em]">{current.label}</span>
              <span className="font-display text-[20px] leading-none">{current.score}</span>
            </span>
          </span>
        )}
        <span className="absolute bottom-3 left-3 text-[11px] uppercase tracking-[0.14em] text-white/95 drop-shadow-[0_1px_2px_rgba(0,0,0,0.45)]">
          {caption}
        </span>
      </div>
      {scanHref && !marked ? (
        <p className="mt-4 text-[13.5px] leading-relaxed text-text-2">
          <span className="text-ink">Demo client.</span> This portrait is an AI-generated stand-in, not a scan, so nothing is
          marked on it.{" "}
          <Link href={scanHref} className="text-ink underline decoration-[#0c1a22]/30 underline-offset-4 hover:decoration-ink">
            Take your own scan
          </Link>{" "}
          to see each priority marked on your face.
        </p>
      ) : (
        <p className="mt-4 text-[13.5px] leading-snug text-text-2">
          {marked ? "Choose a priority to see where it shows on your face." : "Choose a priority to see its score."}
        </p>
      )}
      <div role="group" aria-label="Show a priority on your photo" className="mt-2.5 grid grid-cols-3 gap-2">
        {layers.map((layer) => (
          <Chip key={layer.key} selected={layer.key === active} onClick={() => setActive(layer.key)} className="justify-center px-2 text-center">
            {layer.label}
          </Chip>
        ))}
      </div>
      <div aria-live="polite">
        {current && (
          <p key={current.key} className="t-body mt-4 fade">
            <span className="sr-only">
              {current.label}, {current.score} out of 100.{" "}
            </span>
            {current.describes}
          </p>
        )}
      </div>
    </div>
  );
}
