import type { Scan } from "@/lib/domain";

/**
 * Files every sandbox's demo clients share, such as their portraits (DECISIONS D-014). Read-only: deleting
 * one sandbox's copy of a demo client must never remove them for everyone else.
 */
export const SHARED_DEMO_PREFIX = "demo/";

/** Where a scan's simulated "what to expect" image is kept, next to its photo (DECISIONS D-047). */
export function simulationPath(imagePath: string): string {
  return imagePath.replace(/\.jpg$/, "/simulation.jpg");
}

/** Every storage object a set of scans owns: the photo, any masks, and any simulated image. Shared demo files aren't owned. */
export function scanStoragePaths(scans: Pick<Scan, "imagePath" | "result">[]): string[] {
  return scans
    .flatMap((s) => [
      s.imagePath,
      ...(s.result?.concerns.flatMap((c) => (c.maskPath ? [c.maskPath] : [])) ?? []),
      simulationPath(s.imagePath),
    ])
    .filter((p) => !p.startsWith(SHARED_DEMO_PREFIX));
}
