import "server-only";
import { z } from "zod";

// Empty strings in env files mean "not set".
const optional = z.preprocess((v) => (v === "" ? undefined : v), z.string().optional());
const flag = (fallback: boolean) =>
  z.preprocess((v) => (v === "" || v === undefined ? fallback : String(v).toLowerCase() === "true"), z.boolean());

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  VERCEL_ENV: optional,
  APP_URL: optional,
  DEMO_MODE: flag(true),
  /** Pins the demo calendar, e.g. "2026-12-29" (DECISIONS D-016). */
  DEMO_TODAY: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "DEMO_TODAY must look like 2026-12-29").optional(),
  ),

  NEXT_PUBLIC_SUPABASE_URL: optional,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: optional,
  SUPABASE_SERVICE_ROLE_KEY: optional,

  YOUCAM_API_KEY: optional,
  YOUCAM_MODE: z.preprocess((v) => (v === "" ? undefined : v), z.enum(["live", "fixture"]).default("fixture")),
  /** Total YouCam units bought so far. Raise this after a top-up. */
  YOUCAM_UNIT_BUDGET: z.coerce.number().int().min(0).default(1000),
  /** Milliseconds a fixture analysis "takes", so the processing screen can be seen. */
  FIXTURE_DELAY_MS: z.coerce.number().int().min(0).default(9000),

  ANTHROPIC_API_KEY: optional,
  RESEND_API_KEY: optional,
  EMAIL_FROM: optional,
  STRIPE_SECRET_KEY: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z
      .string()
      .refine((k) => !k.startsWith("sk_live_"), "Live Stripe keys are not allowed. Use a sk_test_ key.")
      .optional(),
  ),
  STRIPE_WEBHOOK_SECRET: optional,

  CRON_SECRET: optional,
  IP_HASH_SALT: optional,
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
  throw new Error(`Invalid environment variables:\n${issues}`);
}

export const env = parsed.data;

export const features = {
  supabase: Boolean(env.NEXT_PUBLIC_SUPABASE_URL && env.NEXT_PUBLIC_SUPABASE_ANON_KEY && env.SUPABASE_SERVICE_ROLE_KEY),
  youcamLive: env.YOUCAM_MODE === "live" && Boolean(env.YOUCAM_API_KEY),
  email: Boolean(env.RESEND_API_KEY),
  isProductionDeploy: env.VERCEL_ENV === "production",
} as const;

/** Secret used to sign local-storage URLs and hash IPs when none is configured. Dev only. */
export function localSecret(): string {
  if (env.IP_HASH_SALT) return env.IP_HASH_SALT;
  if (features.isProductionDeploy) throw new Error("IP_HASH_SALT must be set in production.");
  return "rebloom-local-development-secret";
}
