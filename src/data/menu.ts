// The demo menu (brief section 9). Both demo clinics share it (DECISIONS D-002).
// All prices are demo prices.
import type { Product, Treatment } from "@/lib/domain";
import { stableId } from "@/lib/ids";
import { SEED_CLINICS } from "./clinics";

type TreatmentTemplate = Omit<Treatment, "id" | "clinicId" | "active"> & { key: string };
type ProductTemplate = Omit<Product, "id" | "clinicId" | "active"> & { key: string };

const ALL_ACTIVES = ["retinoid", "sun_exposure", "isotretinoin", "pregnant_breastfeeding", "cold_sores", "sensitivities"] as const;

export const TREATMENT_TEMPLATES: TreatmentTemplate[] = [
  {
    key: "peel-series",
    name: "Signature Peel Series",
    description: "A course of gentle resurfacing peels that refines texture and evens tone.",
    priceCents: 19500,
    sessionsTypical: 3,
    intervalDaysMin: 21,
    intervalDaysMax: 21,
    maintenanceIntervalDays: 90,
    durationMinutes: 45,
    downtimeDays: 3,
    minDaysBeforeEvent: 14,
    concerns: ["texture", "age_spot", "acne", "oiliness", "radiance"],
    screeningFlags: [...ALL_ACTIVES],
  },
  {
    key: "microneedling",
    name: "Microneedling",
    description: "Controlled micro-channels that encourage smoother, firmer looking skin.",
    priceCents: 39500,
    sessionsTypical: 3,
    intervalDaysMin: 28,
    intervalDaysMax: 42,
    maintenanceIntervalDays: 180,
    durationMinutes: 60,
    downtimeDays: 1,
    minDaysBeforeEvent: 14,
    concerns: ["texture", "pore", "wrinkle", "firmness"],
    screeningFlags: ["retinoid", "isotretinoin", "cold_sores", "pregnant_breastfeeding", "sun_exposure"],
  },
  {
    key: "ipl",
    name: "IPL Photofacial",
    description: "Pulses of light that soften the look of sun spots and redness.",
    priceCents: 35000,
    sessionsTypical: 3,
    intervalDaysMin: 28,
    intervalDaysMax: 28,
    maintenanceIntervalDays: 365,
    durationMinutes: 45,
    downtimeDays: 3,
    minDaysBeforeEvent: 14,
    concerns: ["age_spot", "redness"],
    screeningFlags: ["sun_exposure", "pregnant_breastfeeding", "isotretinoin", "sensitivities"],
  },
  {
    key: "hydrating-infusion",
    name: "Hydrating Infusion Facial",
    description: "A deep cleanse and hydrating infusion that leaves skin looking plump and bright.",
    priceCents: 18500,
    sessionsTypical: null,
    intervalDaysMin: 28,
    intervalDaysMax: 35,
    maintenanceIntervalDays: 28,
    durationMinutes: 60,
    downtimeDays: 0,
    minDaysBeforeEvent: 3,
    concerns: ["moisture", "radiance", "pore", "oiliness"],
    screeningFlags: ["sensitivities"],
  },
  {
    key: "led",
    name: "LED Light Therapy",
    description: "Calming light sessions for breakouts, redness and a brighter look.",
    priceCents: 8500,
    sessionsTypical: 6,
    intervalDaysMin: 7,
    intervalDaysMax: 7,
    maintenanceIntervalDays: 30,
    durationMinutes: 30,
    downtimeDays: 0,
    minDaysBeforeEvent: 0,
    concerns: ["acne", "redness", "radiance"],
    screeningFlags: [],
  },
  {
    key: "rf-tightening",
    name: "RF Skin Tightening",
    description: "Gentle radiofrequency warmth for a firmer, more lifted look.",
    priceCents: 45000,
    sessionsTypical: 3,
    intervalDaysMin: 28,
    intervalDaysMax: 28,
    maintenanceIntervalDays: 365,
    durationMinutes: 60,
    downtimeDays: 1,
    minDaysBeforeEvent: 14,
    concerns: ["firmness", "wrinkle", "droopy_upper_eyelid", "droopy_lower_eyelid"],
    screeningFlags: ["pregnant_breastfeeding", "sensitivities"],
  },
  {
    key: "signature-facial",
    name: "Signature Facial",
    description: "Our classic facial, tailored to how your skin looks on the day.",
    priceCents: 16500,
    sessionsTypical: null,
    intervalDaysMin: 28,
    intervalDaysMax: 28,
    maintenanceIntervalDays: 28,
    durationMinutes: 60,
    downtimeDays: 0,
    minDaysBeforeEvent: 2,
    concerns: ["radiance", "moisture", "dark_circle_v2", "eye_bag"],
    screeningFlags: ["sensitivities"],
  },
];

export const PRODUCT_TEMPLATES: ProductTemplate[] = [
  { key: "barrier-serum", name: "Barrier Repair Serum", description: "Calms skin between peels.", priceCents: 6800, concerns: ["redness", "moisture"] },
  { key: "spf-40", name: "Mineral SPF 40", description: "Protects your results from new pigmentation.", priceCents: 4200, concerns: ["age_spot"] },
  { key: "vitamin-c", name: "Brightening Vitamin C Serum", description: "Brightens and helps even out tone.", priceCents: 7400, concerns: ["radiance", "age_spot"] },
  { key: "cream-cleanser", name: "Gentle Cream Cleanser", description: "A soft daily cleanser for every skin, including sensitive skin.", priceCents: 3600, concerns: [] },
];

export const SEED_TREATMENTS: Treatment[] = SEED_CLINICS.flatMap((clinic) =>
  TREATMENT_TEMPLATES.map(({ key, ...t }) => ({
    ...t,
    id: stableId(`treatment:${clinic.slug}:${key}`),
    clinicId: clinic.id,
    active: true,
  })),
);

export const SEED_PRODUCTS: Product[] = SEED_CLINICS.flatMap((clinic) =>
  PRODUCT_TEMPLATES.map(({ key, ...p }) => ({
    ...p,
    id: stableId(`product:${clinic.slug}:${key}`),
    clinicId: clinic.id,
    active: true,
  })),
);
