// YouCam SD skin analysis unit costs, per request, by number of concerns (brief 6.3).
// Failed tasks don't consume units.
export function sdUnitCost(concernCount: number): number {
  if (concernCount <= 0) return 0;
  if (concernCount <= 4) return 9;
  if (concernCount <= 8) return 12;
  if (concernCount <= 12) return 14;
  if (concernCount <= 16) return 16;
  throw new Error("SD skin analysis supports at most 16 concerns per request");
}
