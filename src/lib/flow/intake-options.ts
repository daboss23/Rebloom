import type { AgeRange, BudgetBand, EventType, IntakeConcern, PastTreatment, ScreeningKey } from "@/lib/domain";

export const CONCERN_OPTIONS: [IntakeConcern, string][] = [
  ["uneven_tone", "Uneven tone"],
  ["texture", "Texture"],
  ["pores", "Pores"],
  ["fine_lines", "Fine lines"],
  ["redness", "Redness"],
  ["breakouts", "Breakouts"],
  ["dullness", "Dullness"],
  ["firmness", "Firmness"],
  ["other", "Something else"],
];

export const EVENT_OPTIONS: [EventType, string][] = [
  ["wedding", "Wedding"],
  ["holiday", "Holiday"],
  ["reunion", "Reunion"],
  ["other", "Something else"],
];

export const TREATMENT_OPTIONS: [PastTreatment, string][] = [
  ["none", "None yet"],
  ["facials", "Facials"],
  ["peels", "Peels"],
  ["microneedling", "Microneedling"],
  ["laser_ipl", "Laser or IPL"],
  ["injectables", "Injectables"],
  ["other", "Something else"],
];

export const BUDGET_OPTIONS: [BudgetBand, string][] = [
  ["under_500", "Under $500"],
  ["500_1000", "$500 to $1,000"],
  ["1000_2000", "$1,000 to $2,000"],
  ["2000_plus", "$2,000 or more"],
];

export const AGE_OPTIONS: [AgeRange, string][] = [
  ["under_25", "Under 25"],
  ["25_34", "25 to 34"],
  ["35_44", "35 to 44"],
  ["45_54", "45 to 54"],
  ["55_64", "55 to 64"],
  ["65_plus", "65 or over"],
];

export const SCREENING_QUESTIONS: [ScreeningKey, string][] = [
  ["retinoid", "Do you use a retinoid, like retinol or tretinoin?"],
  ["sun_exposure", "Any sun exposure or a tan in the last two weeks?"],
  ["pregnant_breastfeeding", "Are you pregnant or breastfeeding?"],
  ["isotretinoin", "Have you taken isotretinoin in the last six months?"],
  ["cold_sores", "Do you have an active cold sore?"],
  ["sensitivities", "Any skin sensitivities or allergies?"],
];

/** Practitioner-facing wording for a "yes" (used in the brief). Never shown as a block. */
export const SCREENING_FLAG_TEXT: Record<ScreeningKey, string> = {
  retinoid: "Reports retinoid use. Check against your protocol.",
  sun_exposure: "Recent sun exposure or tan. Check before light or resurfacing treatments.",
  pregnant_breastfeeding: "Pregnant or breastfeeding. Review treatment suitability.",
  isotretinoin: "Isotretinoin in the last six months. Review before resurfacing or needling.",
  cold_sores: "Active cold sore. Review before treating the mouth area.",
  sensitivities: "Reports skin sensitivities or allergies.",
};
