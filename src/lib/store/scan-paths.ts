import type { Scan } from "@/lib/domain";

/** Every storage object a set of scans owns: the photo, plus any masks. */
export function scanStoragePaths(scans: Pick<Scan, "imagePath" | "result">[]): string[] {
  return scans.flatMap((s) => [s.imagePath, ...(s.result?.concerns.flatMap((c) => (c.maskPath ? [c.maskPath] : [])) ?? [])]);
}
