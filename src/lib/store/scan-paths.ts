import type { Scan } from "@/lib/domain";

/** Where a scan's simulated "what to expect" image is kept, next to its photo (DECISIONS D-047). */
export function simulationPath(imagePath: string): string {
  return imagePath.replace(/\.jpg$/, "/simulation.jpg");
}

/** Every storage object a set of scans owns: the photo, any masks, and any simulated image. */
export function scanStoragePaths(scans: Pick<Scan, "imagePath" | "result">[]): string[] {
  return scans.flatMap((s) => [
    s.imagePath,
    ...(s.result?.concerns.flatMap((c) => (c.maskPath ? [c.maskPath] : [])) ?? []),
    simulationPath(s.imagePath),
  ]);
}
