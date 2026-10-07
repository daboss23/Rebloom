"use client";

import { usePathname } from "next/navigation";
import { LightField } from "@/components/dashboard/LightField";

/**
 * Morning light at the top of every client page (DECISIONS D-061). It lives in the layout, so it keeps moving
 * from one step to the next. Off on the camera screens (first scan and rescan), where attention belongs to the camera.
 */
export function ShellLight() {
  const path = usePathname();
  if (path.endsWith("/capture") || path.endsWith("/rescan")) return null;
  // The report is read by scrolling, so its water is bluer, reaches further down and fades out over a longer run.
  // Booking sits a step deeper still, so its white day and time cards stand clear of the light. Small labels on
  // that water use text-2: text-3 falls under 4.5:1 there.
  const report = path.startsWith("/r/");
  const booking = report && /^\/r\/[^/]+\/book(\/|$)/.test(path);
  return (
    <div
      aria-hidden
      className={
        booking
          ? // Booking keeps the light to the top and fades it out before the days, so choosing happens on calm ground.
            "pointer-events-none absolute inset-x-0 top-0 h-[440px] [mask-image:linear-gradient(180deg,#000_0%,#000_35%,transparent_100%)]"
          : report
          ? "pointer-events-none absolute inset-x-0 top-0 h-[1100px] [mask-image:linear-gradient(180deg,#000_0%,#000_45%,rgba(0,0,0,0.6)_70%,transparent_100%)]"
          : "pointer-events-none absolute inset-x-0 top-0 h-[600px] [mask-image:linear-gradient(180deg,#000_0%,#000_40%,transparent_100%)]"
      }
    >
      <LightField variant={booking ? "lagoon" : report ? "shallows" : "ice"} />
      <div
        className={
          booking
            ? "absolute inset-0 bg-[radial-gradient(ellipse_70%_40%_at_40%_16%,rgba(246,251,253,0.5)_0%,rgba(246,251,253,0.14)_60%,rgba(246,251,253,0)_100%)]"
            : report
            ? "absolute inset-0 bg-[radial-gradient(ellipse_70%_45%_at_42%_22%,rgba(246,251,253,0.62)_0%,rgba(246,251,253,0.2)_60%,rgba(246,251,253,0)_100%)]"
            : "absolute inset-0 bg-[radial-gradient(ellipse_95%_70%_at_30%_38%,rgba(246,251,253,0.8)_0%,rgba(246,251,253,0.35)_60%,rgba(246,251,253,0)_100%)]"
        }
      />
    </div>
  );
}
