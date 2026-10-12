// Fitzpatrick skin type (DECISIONS D-094): YouCam's estimate from the first live scan, or Dana's own call.
// A safety prompt for the practitioner, never a diagnosis and never shown to the client. Pure.

export const FITZPATRICK_TYPES = ["I", "II", "III", "IV", "V", "VI"] as const;
export type FitzpatrickType = (typeof FITZPATRICK_TYPES)[number];

export interface FitzpatrickReading {
  type: FitzpatrickType;
  /** "scan": YouCam's estimate from a live scan. "practitioner": set or confirmed by the clinic, and kept. */
  source: "scan" | "practitioner";
  at: string;
  /** The scan the estimate came from. */
  scanId?: string | null;
}

export function isFitzpatrickType(value: unknown): value is FitzpatrickType {
  return typeof value === "string" && (FITZPATRICK_TYPES as readonly string[]).includes(value);
}

/** 1 for type I up to 6 for type VI. */
export function fitzpatrickRank(type: FitzpatrickType): number {
  return FITZPATRICK_TYPES.indexOf(type) + 1;
}

/**
 * Whether a treatment suits this skin type. `fitzpatrickMax` is the highest type the clinic offers it to
 * (IPL: 3). No limit, or no reading yet, means no restriction: an unknown type never hides a treatment.
 */
export function suitsSkinType(treatment: { fitzpatrickMax?: number | null }, type: FitzpatrickType | null | undefined): boolean {
  if (!type || treatment.fitzpatrickMax == null) return true;
  return fitzpatrickRank(type) <= treatment.fitzpatrickMax;
}

/** "Type IV". */
export const skinTypeLabel = (type: FitzpatrickType) => `Type ${type}`;

/** "types I to III" for a limit of 3, to sit inside a sentence. Null for no limit. */
export function limitLabel(max: number | null | undefined): string | null {
  if (max == null || max >= 6) return null;
  return max <= 1 ? "type I" : `types I to ${FITZPATRICK_TYPES[max - 1]}`;
}
