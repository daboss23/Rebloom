import { z } from "zod";

export const INTAKE_STEPS = ["concerns", "goal", "event", "treatments", "budget", "screening", "about"] as const;
export type IntakeStep = (typeof INTAKE_STEPS)[number];

const concern = z.enum(["uneven_tone", "texture", "pores", "fine_lines", "redness", "breakouts", "dullness", "firmness", "other"]);
const pastTreatment = z.enum(["none", "facials", "peels", "microneedling", "laser_ipl", "injectables", "other"]);
const answer = z.enum(["yes", "no", "unsure"]);
const shortText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((s) => (s === "" ? null : s))
    .nullable();

export const stepSchemas = {
  concerns: z.object({
    concerns: z.array(concern).min(1, "Choose at least one.").max(9),
    concernsOther: shortText(120),
  }),
  goal: z.object({ goalText: shortText(600) }),
  event: z
    .object({
      hasEvent: z.boolean(),
      eventType: z.enum(["wedding", "holiday", "reunion", "other"]).nullable(),
      eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
    })
    .refine((v) => !v.hasEvent || (v.eventType && v.eventDate), { message: "Choose the event and its date." }),
  treatments: z.object({
    pastTreatments: z
      .array(pastTreatment)
      .min(1, "Choose one, or None yet.")
      .refine((list) => !(list.includes("none") && list.length > 1), "None yet can't be combined with others."),
  }),
  budget: z.object({ budgetBand: z.enum(["under_500", "500_1000", "1000_2000", "2000_plus"]) }),
  screening: z.object({
    screening: z.object({
      retinoid: answer.optional(),
      sun_exposure: answer.optional(),
      pregnant_breastfeeding: answer.optional(),
      isotretinoin: answer.optional(),
      cold_sores: answer.optional(),
      sensitivities: answer.optional(),
    }),
    sensitivitiesNote: shortText(200),
  }),
  about: z.object({
    ageRange: z.enum(["under_25", "25_34", "35_44", "45_54", "55_64", "65_plus"]).nullable(),
  }),
} satisfies Record<IntakeStep, z.ZodType>;

/** The report gate: contact details are asked for only after the scan (brief 3.1 step 6). */
export const unlockSchema = z.object({
  firstName: z.string().trim().min(1, "Please add your first name.").max(60),
  lastName: z.string().trim().min(1, "Please add your last name.").max(60),
  email: z.string().trim().toLowerCase().min(1, "Please add your primary email.").email("Please check your email address."),
  phone: shortText(30),
});
