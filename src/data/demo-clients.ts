// The demo clients (DECISIONS D-003, D-049). Every sandbox gets its own copy, laid out around that
// sandbox's "today" (D-014), so the dashboard always looks current. Days are counted from today:
// -85 is 85 days ago. Visit days snap to the clinic's open days when the copy is made.
//
// Five have starring roles and portraits (D-030): one per stage of the loop. The other seven fill
// the client list, the rebook queue and the Insights charts. Between them, every client status and
// every rebook trigger in brief 3.4 is on screen the moment the dashboard opens.
//
// Scores are authored, on the fixture scale (D-004): a first scan builds on a sample profile, and each
// later scan lists only what changed. Progress maths reads raw scores, derived from these.

import type { AgeRange, BudgetBand, ClientStatus, EventType, IntakeConcern, PastTreatment, ScreeningAnswer, ScreeningKey } from "@/lib/domain";
import type { ConcernKey } from "@/lib/skin/concerns";

export type TreatmentKey = "peel-series" | "microneedling" | "ipl" | "hydrating-infusion" | "led" | "rf-tightening" | "signature-facial";
export type ProductKey = "barrier-serum" | "spf-40" | "vitamin-c" | "cream-cleanser";

export interface DemoVisit {
  day: number;
  /** Local clinic time, on the half-hour grid. */
  time: string;
  /** A treatment, or a first consult. */
  treatment: TreatmentKey | "consult";
  /** Counts towards the confirmed plan's course. */
  planned?: boolean;
}

export interface DemoClient {
  key: string;
  firstName: string;
  lastName: string;
  ageRange: AgeRange;
  status: ClientStatus;
  /** Has a starring role, so needs a portrait (D-030). */
  starring: boolean;
  /** For whoever makes the portrait: how this person looks. */
  look: string;
  /** Why they're in the demo. */
  role: string;
  /** Said yes to reminders. Without it the rebook engine may not email them. */
  reminders: boolean;
  /** Said yes to texts too (D-080): the queue offers a text beside the email. */
  texts?: boolean;
  intake: {
    concerns: IntakeConcern[];
    goalText: string | null;
    event: { type: EventType; day: number } | null;
    pastTreatments: PastTreatment[];
    budgetBand: BudgetBand;
    screening: Partial<Record<ScreeningKey, ScreeningAnswer>>;
  };
  /** Sample profile the first scan starts from (src/lib/youcam/fixture.ts). */
  profile: number;
  skinAge: number;
  skinType: string;
  /** The first scan's changes from the profile, then each later scan's changes from the one before. */
  scans: { day: number; ui: Partial<Record<ConcernKey, number>> }[];
  plan: {
    day: number;
    status: "proposed" | "confirmed" | "completed";
    treatments: { key: TreatmentKey; sessions: number }[];
    products: ProductKey[];
  } | null;
  visits: DemoVisit[];
  /** Dana's note, shown on the client's report. */
  note: string | null;
}

const none = { retinoid: "no", sun_exposure: "no", pregnant_breastfeeding: "no", isotretinoin: "no", cold_sores: "no", sensitivities: "no" } as const;

export const DEMO_CLIENTS: DemoClient[] = [
  // ---------- Starring ----------
  {
    key: "amelia",
    firstName: "Amelia",
    lastName: "Reyes",
    ageRange: "25_34",
    status: "course_complete",
    starring: true,
    look: "34, fair skin with light freckles, shoulder-length auburn hair",
    role: "The hero. Course complete before her wedding, with a progress moment and one last facial booked.",
    reminders: true,
    intake: {
      concerns: ["uneven_tone", "texture"],
      goalText: "Smoother, more even skin for my wedding photos.",
      event: { type: "wedding", day: 13 },
      pastTreatments: ["none"],
      budgetBand: "1000_2000",
      // Retinol nightly, and a beach holiday two weeks before her first scan (brief section 9).
      screening: { ...none, retinoid: "yes", sun_exposure: "yes" },
    },
    profile: 0,
    skinAge: 33,
    skinType: "combination",
    scans: [
      { day: -85, ui: {} },
      { day: -57, ui: { texture: 62, age_spot: 64, pore: 67 } },
      { day: -36, ui: { texture: 67, age_spot: 67, pore: 68 } },
      { day: -1, ui: { texture: 71, age_spot: 70, pore: 69, radiance: 74 } },
    ],
    plan: {
      day: -80,
      status: "completed",
      treatments: [
        { key: "peel-series", sessions: 3 },
        { key: "microneedling", sessions: 1 },
      ],
      products: ["barrier-serum", "spf-40"],
    },
    visits: [
      { day: -77, time: "10:30", treatment: "peel-series", planned: true },
      { day: -56, time: "10:30", treatment: "peel-series", planned: true },
      { day: -35, time: "10:30", treatment: "peel-series", planned: true },
      { day: -21, time: "14:00", treatment: "microneedling", planned: true },
      // Dana's suggestion once the course was done: a gentle facial six days before the wedding (D-005).
      { day: 7, time: "11:00", treatment: "hydrating-infusion" },
    ],
    note: "Amelia, your texture has come a long way since October. One hydrating facial the week before the wedding, then just SPF and your serum.",
  },
  {
    key: "priya",
    firstName: "Priya",
    lastName: "Shah",
    ageRange: "25_34",
    status: "lead",
    starring: true,
    look: "29, South Asian, medium brown skin, long dark hair tied back",
    role: "New lead. Got her report four days ago and hasn't booked: the follow-up is due.",
    reminders: true,
    texts: true,
    intake: {
      concerns: ["breakouts", "pores"],
      goalText: "Fewer breakouts and smaller looking pores.",
      event: null,
      pastTreatments: ["facials"],
      budgetBand: "500_1000",
      screening: { ...none },
    },
    profile: 2,
    skinAge: 27,
    skinType: "oily",
    scans: [{ day: -4, ui: {} }],
    plan: null,
    visits: [],
    note: null,
  },
  {
    key: "marcus",
    firstName: "Marcus",
    lastName: "Thompson",
    ageRange: "35_44",
    status: "booked",
    starring: true,
    look: "38, Black, deep brown skin, short cropped hair, clean-shaven",
    role: "Booked his first consult for today, deposit paid. Opens the practitioner brief.",
    reminders: true,
    intake: {
      concerns: ["redness", "uneven_tone"],
      goalText: "Calm the redness on my cheeks after shaving.",
      event: null,
      pastTreatments: ["none"],
      budgetBand: "500_1000",
      screening: { ...none, sensitivities: "yes" },
    },
    profile: 3,
    skinAge: 39,
    skinType: "normal",
    scans: [{ day: -2, ui: { redness: 59, age_spot: 66 } }],
    plan: null,
    visits: [{ day: 0, time: "11:00", treatment: "consult" }],
    note: null,
  },
  {
    key: "sofia",
    firstName: "Sofia",
    lastName: "Morales",
    ageRange: "45_54",
    status: "in_course",
    starring: true,
    look: "45, Latina, medium olive skin, dark brown hair",
    role: "Mid-course. Her rescan shows real change, and her next session isn't booked: a great moment to rebook.",
    reminders: true,
    texts: true,
    intake: {
      concerns: ["fine_lines", "firmness"],
      goalText: "Soften the lines around my eyes and mouth.",
      event: null,
      pastTreatments: ["facials", "peels"],
      budgetBand: "1000_2000",
      screening: { ...none },
    },
    profile: 1,
    skinAge: 46,
    skinType: "dry",
    scans: [
      { day: -56, ui: {} },
      { day: -2, ui: { wrinkle: 65, firmness: 68, texture: 79 } },
    ],
    plan: {
      day: -52,
      status: "confirmed",
      treatments: [{ key: "microneedling", sessions: 3 }],
      products: ["vitamin-c"],
    },
    visits: [
      { day: -47, time: "13:00", treatment: "microneedling", planned: true },
      { day: -12, time: "13:00", treatment: "microneedling", planned: true },
    ],
    note: "Lovely change in the fine lines already. Session three in the next couple of weeks keeps it going.",
  },
  {
    key: "grace",
    firstName: "Grace",
    lastName: "Lin",
    ageRange: "45_54",
    status: "at_risk",
    starring: true,
    look: "52, East Asian, light skin, black hair with some grey, chin-length",
    role: "Stalled. Two rescans with almost no change, so she's flagged for Dana to adjust the plan before tomorrow's session.",
    reminders: true,
    intake: {
      concerns: ["uneven_tone", "redness"],
      goalText: "Fade the sun spots on my cheeks.",
      event: null,
      pastTreatments: ["laser_ipl"],
      budgetBand: "1000_2000",
      screening: { ...none },
    },
    profile: 3,
    skinAge: 53,
    skinType: "normal",
    scans: [
      { day: -66, ui: { age_spot: 58, redness: 64, radiance: 66 } },
      { day: -38, ui: { texture: 71 } },
      { day: -10, ui: { moisture: 69 } },
    ],
    plan: {
      day: -63,
      status: "confirmed",
      treatments: [{ key: "ipl", sessions: 3 }],
      products: ["spf-40"],
    },
    visits: [
      { day: -55, time: "15:00", treatment: "ipl", planned: true },
      { day: -27, time: "15:00", treatment: "ipl", planned: true },
      { day: 1, time: "15:00", treatment: "ipl", planned: true },
    ],
    note: null,
  },

  // ---------- Supporting ----------
  {
    key: "hannah",
    firstName: "Hannah",
    lastName: "Keller",
    ageRange: "25_34",
    status: "in_course",
    starring: false,
    look: "31, white, light skin, blonde hair",
    role: "Weekly LED course, on track. In today's schedule.",
    reminders: true,
    intake: {
      concerns: ["breakouts", "redness"],
      goalText: "Clearer skin without anything harsh.",
      event: null,
      pastTreatments: ["facials"],
      budgetBand: "under_500",
      screening: { ...none },
    },
    profile: 2,
    skinAge: 30,
    skinType: "oily",
    scans: [{ day: -26, ui: { acne: 58, redness: 64 } }],
    plan: {
      day: -24,
      status: "confirmed",
      treatments: [{ key: "led", sessions: 6 }],
      products: ["barrier-serum"],
    },
    visits: [
      { day: -21, time: "16:00", treatment: "led", planned: true },
      { day: -14, time: "16:00", treatment: "led", planned: true },
      { day: -7, time: "16:00", treatment: "led", planned: true },
      { day: 0, time: "16:00", treatment: "led", planned: true },
      { day: 7, time: "16:00", treatment: "led", planned: true },
    ],
    note: null,
  },
  {
    key: "olivia",
    firstName: "Olivia",
    lastName: "Park",
    ageRange: "25_34",
    status: "booked",
    starring: false,
    look: "27, mixed heritage, light brown skin, curly dark hair",
    role: "Booked her first peel from the report, before a holiday.",
    reminders: true,
    intake: {
      concerns: ["texture", "dullness"],
      goalText: "Brighter skin before my trip.",
      event: { type: "holiday", day: 40 },
      pastTreatments: ["none"],
      budgetBand: "500_1000",
      screening: { ...none },
    },
    profile: 0,
    skinAge: 26,
    skinType: "combination",
    scans: [{ day: -6, ui: { texture: 61, radiance: 64 } }],
    plan: {
      day: -5,
      status: "proposed",
      treatments: [{ key: "peel-series", sessions: 3 }],
      products: ["spf-40"],
    },
    visits: [{ day: 3, time: "12:00", treatment: "peel-series", planned: true }],
    note: null,
  },
  {
    key: "daniel",
    firstName: "Daniel",
    lastName: "Walsh",
    ageRange: "35_44",
    status: "at_risk",
    starring: false,
    look: "41, white, fair skin, short brown hair, clean-shaven",
    role: "Missed. His second peel was due over two weeks ago and never booked.",
    reminders: true,
    texts: true,
    intake: {
      concerns: ["texture", "pores"],
      goalText: null,
      event: null,
      pastTreatments: ["none"],
      budgetBand: "500_1000",
      screening: { ...none },
    },
    profile: 0,
    skinAge: 42,
    skinType: "oily",
    scans: [{ day: -45, ui: { texture: 60, pore: 63 } }],
    plan: {
      day: -42,
      status: "confirmed",
      treatments: [{ key: "peel-series", sessions: 3 }],
      products: [],
    },
    visits: [{ day: -38, time: "17:00", treatment: "peel-series", planned: true }],
    note: null,
  },
  {
    key: "nina",
    firstName: "Nina",
    lastName: "Farah",
    ageRange: "55_64",
    status: "course_complete",
    starring: false,
    look: "58, Middle Eastern, light olive skin, grey-streaked dark hair",
    role: "Finished her peel series three months ago: due for maintenance.",
    reminders: true,
    intake: {
      concerns: ["texture", "uneven_tone"],
      goalText: "Refresh my skin after a summer outdoors.",
      event: null,
      pastTreatments: ["peels", "facials"],
      budgetBand: "1000_2000",
      screening: { ...none },
    },
    profile: 1,
    skinAge: 57,
    skinType: "dry",
    scans: [
      { day: -147, ui: { texture: 64, age_spot: 62 } },
      { day: -84, ui: { texture: 70, age_spot: 67 } },
    ],
    plan: {
      day: -144,
      status: "completed",
      treatments: [{ key: "peel-series", sessions: 3 }],
      products: ["spf-40"],
    },
    visits: [
      { day: -139, time: "10:00", treatment: "peel-series", planned: true },
      { day: -118, time: "10:00", treatment: "peel-series", planned: true },
      { day: -97, time: "10:00", treatment: "peel-series", planned: true },
    ],
    note: null,
  },
  {
    key: "chloe",
    firstName: "Chloe",
    lastName: "Bennett",
    ageRange: "35_44",
    status: "lapsed",
    starring: false,
    look: "36, Black, medium brown skin, natural hair",
    role: "Lapsed. One facial five months ago, nothing since, and no reminders: a call, not an email.",
    reminders: false,
    intake: {
      concerns: ["dullness"],
      goalText: null,
      event: null,
      pastTreatments: ["facials"],
      budgetBand: "under_500",
      screening: { ...none },
    },
    profile: 3,
    skinAge: 37,
    skinType: "normal",
    scans: [{ day: -156, ui: { radiance: 61, moisture: 64 } }],
    plan: {
      day: -153,
      status: "confirmed",
      treatments: [{ key: "signature-facial", sessions: 3 }],
      products: [],
    },
    visits: [{ day: -150, time: "12:30", treatment: "signature-facial", planned: true }],
    note: null,
  },
  {
    key: "isabel",
    firstName: "Isabel",
    lastName: "Navarro",
    ageRange: "under_25",
    status: "lead",
    starring: false,
    look: "24, Filipina, light-medium skin, long black hair",
    role: "Scanned yesterday. Move the clock forward two days and her follow-up appears.",
    reminders: true,
    intake: {
      concerns: ["dullness"],
      goalText: "Brighter skin and softer dark circles under my eyes.",
      event: null,
      pastTreatments: ["none"],
      budgetBand: "under_500",
      screening: { ...none },
    },
    profile: 0,
    skinAge: 24,
    skinType: "combination",
    scans: [{ day: -1, ui: { dark_circle_v2: 60, radiance: 66 } }],
    plan: null,
    visits: [],
    note: null,
  },
  {
    key: "rachel",
    firstName: "Rachel",
    lastName: "Grant",
    ageRange: "45_54",
    status: "in_course",
    starring: false,
    look: "47, white, medium skin with sun freckles, light brown hair",
    role: "Finished her three peels two weeks ago: her progress scan is due.",
    reminders: true,
    intake: {
      concerns: ["uneven_tone", "texture"],
      goalText: "Even out my skin tone.",
      event: null,
      pastTreatments: ["facials"],
      budgetBand: "500_1000",
      screening: { ...none },
    },
    profile: 3,
    skinAge: 48,
    skinType: "normal",
    scans: [{ day: -63, ui: { age_spot: 60, texture: 64 } }],
    plan: {
      day: -60,
      status: "confirmed",
      treatments: [{ key: "peel-series", sessions: 3 }],
      products: ["spf-40"],
    },
    visits: [
      { day: -57, time: "11:30", treatment: "peel-series", planned: true },
      { day: -36, time: "11:30", treatment: "peel-series", planned: true },
      { day: -15, time: "11:30", treatment: "peel-series", planned: true },
    ],
    note: null,
  },
];
