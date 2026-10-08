"use client";

import { useEffect, useState } from "react";
import { FaceScan } from "@/components/flow/FaceScan";

const STAGES = ["Reading texture", "Mapping tone", "Measuring pores and lines", "Writing your report"];

/** Walks the stages as a real analysis would, then completes. */
export function ScanPreview({ photo, points }: { photo: string | null; points: [number, number][] | null }) {
  const [t, setT] = useState(0);
  useEffect(() => {
    const i = window.setInterval(() => setT((n) => n + 1), 1000);
    return () => window.clearInterval(i);
  }, []);
  const stage = Math.min(STAGES.length - 1, Math.floor(t / 3));
  const done = t >= 12;
  return (
    <FaceScan
      photo={photo}
      points={points}
      stage={STAGES[stage]}
      step={stage + 1}
      steps={STAGES.length}
      progress={done ? 1 : (stage + 0.5) / STAGES.length}
      done={done}
    />
  );
}
