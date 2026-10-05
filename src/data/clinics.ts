import type { Clinic, OpeningHours } from "@/lib/domain";
import { stableId } from "@/lib/ids";

const TUE_TO_SAT_10_TO_6: OpeningHours = {
  days: {
    2: { open: "10:00", close: "18:00" },
    3: { open: "10:00", close: "18:00" },
    4: { open: "10:00", close: "18:00" },
    5: { open: "10:00", close: "18:00" },
    6: { open: "10:00", close: "18:00" },
  },
  slotMinutes: 30,
};

/** The hero demo clinic (brief section 9). */
export const MAISON_VERRE: Clinic = {
  id: stableId("clinic:maison-verre"),
  slug: "maison-verre",
  name: "Maison Verre",
  wordmark: "MAISON VERRE",
  wordmarkStyle: "serif",
  monogramUrl: "/brand/maison-verre/monogram.png",
  lockupUrl: "/brand/maison-verre/lockup.png",
  accentHex: "#C9B79C",
  city: "Santa Monica",
  address: "1200 Montana Avenue, Santa Monica, CA",
  phone: "(310) 555-0142",
  timezone: "America/Los_Angeles",
  hours: TUE_TO_SAT_10_TO_6,
  depositCents: 5000,
};

/** The second, smaller demo clinic that proves white-label works (DECISIONS D-002). */
export const TIDEWATER: Clinic = {
  id: stableId("clinic:tidewater"),
  slug: "tidewater",
  name: "Tidewater Skin Studio",
  wordmark: "TIDEWATER",
  wordmarkStyle: "sans",
  accentHex: "#8FB8AE",
  city: "Charleston",
  address: "88 Queen Street, Charleston, SC",
  phone: "(843) 555-0187",
  timezone: "America/New_York",
  hours: TUE_TO_SAT_10_TO_6,
  depositCents: 5000,
};

export const SEED_CLINICS: Clinic[] = [MAISON_VERRE, TIDEWATER];
