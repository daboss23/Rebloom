// The single source of truth for YouCam skin concerns.
// Raw API names never reach a client: always go through `concernLabel`.

import type { IntakeConcern } from "@/lib/domain";

/** SD concerns we request (brief 6.1). `skin_type` is a classification, not a score. */
export const SCORED_CONCERNS = [
  "texture",
  "pore",
  "age_spot",
  "redness",
  "wrinkle",
  "firmness",
  "acne",
  "moisture",
  "radiance",
  "oiliness",
  "dark_circle_v2",
  "eye_bag",
  "droopy_upper_eyelid",
  "droopy_lower_eyelid",
  "tear_trough",
] as const;

export type ConcernKey = (typeof SCORED_CONCERNS)[number];

/** Requested with every full scan. */
export const FULL_SCAN_CONCERNS: readonly (ConcernKey | "skin_type")[] = [...SCORED_CONCERNS, "skin_type"];

/** The 4-concern set for lighting calibration (DECISIONS D-011). */
export const CALIBRATION_CONCERNS: readonly ConcernKey[] = ["texture", "age_spot", "pore", "redness"];

/** Facial regions used to draw demo masks (see lib/skin/fixture-masks.ts). */
export type FaceRegion =
  | "forehead"
  | "cheek_left"
  | "cheek_right"
  | "nose"
  | "chin"
  | "under_eye_left"
  | "under_eye_right"
  | "upper_lid_left"
  | "upper_lid_right"
  | "crows_left"
  | "crows_right"
  | "jaw_left"
  | "jaw_right";

/** How a demo mask is drawn: fine grain, dots, blotches, soft wash or fine lines. */
export type MaskPattern = "grain" | "dots" | "blotches" | "wash" | "lines";

export interface ConcernInfo {
  key: ConcernKey;
  label: string;
  /** One plain sentence: what this concern describes. */
  describes: string;
  regions: FaceRegion[];
  pattern: MaskPattern;
}

const C = (
  key: ConcernKey,
  label: string,
  describes: string,
  regions: FaceRegion[],
  pattern: MaskPattern,
): ConcernInfo => ({ key, label, describes, regions, pattern });

export const CONCERNS: Record<ConcernKey, ConcernInfo> = {
  texture: C("texture", "Texture", "How smooth your skin looks up close.", ["cheek_left", "cheek_right", "forehead"], "grain"),
  pore: C("pore", "Pores", "How visible pores are, mostly around the nose and inner cheeks.", ["nose", "cheek_left", "cheek_right"], "dots"),
  age_spot: C("age_spot", "Pigmentation", "How even your skin tone looks, including sun spots and darker patches.", ["cheek_left", "cheek_right", "forehead"], "blotches"),
  redness: C("redness", "Redness", "Visible redness and flushing, usually across the cheeks and nose.", ["cheek_left", "cheek_right", "nose"], "wash"),
  wrinkle: C("wrinkle", "Wrinkles", "Lines around the eyes and forehead.", ["crows_left", "crows_right", "forehead"], "lines"),
  firmness: C("firmness", "Firmness", "How lifted and firm the lower face looks.", ["jaw_left", "jaw_right"], "wash"),
  acne: C("acne", "Blemishes", "Active breakouts and visible marks.", ["chin", "cheek_left", "cheek_right", "forehead"], "dots"),
  moisture: C("moisture", "Moisture", "How hydrated and supple your skin looks.", ["cheek_left", "cheek_right"], "wash"),
  radiance: C("radiance", "Radiance", "How bright and luminous your skin looks.", ["forehead", "cheek_left", "cheek_right"], "wash"),
  oiliness: C("oiliness", "Oiliness", "Shine, mostly across the forehead, nose and chin.", ["forehead", "nose", "chin"], "wash"),
  dark_circle_v2: C("dark_circle_v2", "Dark circles", "Darkness beneath the eyes.", ["under_eye_left", "under_eye_right"], "wash"),
  eye_bag: C("eye_bag", "Eye bags", "Puffiness beneath the eyes.", ["under_eye_left", "under_eye_right"], "wash"),
  droopy_upper_eyelid: C("droopy_upper_eyelid", "Upper eyelid firmness", "How lifted the upper eyelids look.", ["upper_lid_left", "upper_lid_right"], "wash"),
  droopy_lower_eyelid: C("droopy_lower_eyelid", "Lower eyelid firmness", "How firm the skin just below the lash line looks.", ["under_eye_left", "under_eye_right"], "lines"),
  tear_trough: C("tear_trough", "Under-eye hollows", "Hollowness between the lower lid and the cheek.", ["under_eye_left", "under_eye_right"], "wash"),
};

export function concernLabel(key: ConcernKey): string {
  return CONCERNS[key].label;
}

export function isConcernKey(value: string): value is ConcernKey {
  return (SCORED_CONCERNS as readonly string[]).includes(value);
}

/** Maps what clients tick in intake to the concerns we measure. */
export const INTAKE_TO_CONCERNS: Record<IntakeConcern, ConcernKey[]> = {
  uneven_tone: ["age_spot", "radiance"],
  texture: ["texture"],
  pores: ["pore"],
  fine_lines: ["wrinkle"],
  redness: ["redness"],
  breakouts: ["acne", "oiliness"],
  dullness: ["radiance"],
  firmness: ["firmness", "droopy_upper_eyelid", "droopy_lower_eyelid"],
  other: [],
};
