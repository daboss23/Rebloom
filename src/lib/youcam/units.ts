// YouCam skin analysis unit costs, per request, by number of concerns (brief 6.3, DECISIONS D-046).
// Failed tasks don't consume units.

export type SkinEngine = "sd" | "hd";

const TIERS: [maxConcerns: number, sd: number, hd: number][] = [
  [4, 9, 12],
  [8, 12, 16],
  [12, 14, 20],
  [16, 16, 22],
];

export function unitCost(engine: SkinEngine, concernCount: number): number {
  if (concernCount <= 0) return 0;
  const tier = TIERS.find(([max]) => concernCount <= max);
  if (!tier) throw new Error("Skin analysis supports at most 16 concerns per request");
  return engine === "hd" ? tier[2] : tier[1];
}

export function sdUnitCost(concernCount: number): number {
  return unitCost("sd", concernCount);
}
