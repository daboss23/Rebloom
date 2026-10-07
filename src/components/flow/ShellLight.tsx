"use client";

import { usePathname } from "next/navigation";
import { LightField } from "@/components/dashboard/LightField";

/**
 * Morning light at the top of every client page (DECISIONS D-061). It lives in the layout, so it keeps moving
 * from one step to the next. Off on the camera screen, where the phone's attention belongs to the camera.
 */
export function ShellLight() {
  const path = usePathname();
  if (path.endsWith("/capture")) return null;
  // The report is read by scrolling, so its water is bluer, reaches further down and fades out over a longer run.
  const report = path.startsWith("/r/");
  return (
    <div
      aria-hidden
      className={
        report
          ? "pointer-events-none absolute inset-x-0 top-0 h-[1100px] [mask-image:linear-gradient(180deg,#000_0%,#000_45%,rgba(0,0,0,0.6)_70%,transparent_100%)]"
          : "pointer-events-none absolute inset-x-0 top-0 h-[600px] [mask-image:linear-gradient(180deg,#000_0%,#000_40%,transparent_100%)]"
      }
    >
      <LightField variant={report ? "shallows" : "ice"} />
      <div
        className={
          report
            ? "absolute inset-0 bg-[radial-gradient(ellipse_70%_45%_at_42%_22%,rgba(246,251,253,0.62)_0%,rgba(246,251,253,0.2)_60%,rgba(246,251,253,0)_100%)]"
            : "absolute inset-0 bg-[radial-gradient(ellipse_95%_70%_at_30%_38%,rgba(246,251,253,0.8)_0%,rgba(246,251,253,0.35)_60%,rgba(246,251,253,0)_100%)]"
        }
      />
    </div>
  );
}
