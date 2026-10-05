import "server-only";
import { z } from "zod";

// Empty strings in env files mean "not set".
const optional = z.preprocess((v) => (v === "" ? undefined : v), z.string().optional());
/** For choices from a fixed list: case doesn't matter, so "Live" works as well as "live". */
const lower = (v: unknown) => (v === "" || v === undefined ? undefined : String(v).toLowerCase());

/** True for Supabase's public key: sb_publishable_…, or an older JWT key whose role is anon. */
export function isPublicSupabaseKey(key: string): boolean {
  if (key.startsWith("sb_publishable_")) return true;
  const payload = key.split(".")[1];
  if (!payload) return false;
  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")).role === "anon";
  } catch {
    return false;
  }
}

// The public key in the secret slot fails later as a baffling "permission denied". Say so up front.
const secretKey = z.preprocess(
  (v) => (v === "" ? undefined : v),
  z
    .string()
    .refine((k) => !isPublicSupabaseKey(k), "This is Supabase's public key. Use the secret (service_role) key here.")
    .optional(),
);
const flag = (fallback: boolean) =>
  z.preprocess((v) => (v === "" || v === undefined ? fallback : String(v).toLowerCase() === "true"), z.boolean());

export const envSchema = z.object({
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
  SUPABASE_SERVICE_ROLE_KEY: secretKey,
  /** Supabase's newer name for the same secret (sb_secret_…). Either one works. */
  SUPABASE_SECRET_KEY: secretKey,
  /** "local" forces the file store even when Supabase keys are present (browser tests use this). */
  REBLOOM_STORE: z.preprocess(lower, z.enum(["local", "supabase"]).optional()),

  YOUCAM_API_KEY: optional,
  YOUCAM_MODE: z.preprocess(lower, z.enum(["live", "fixture"]).default("fixture")),
  /** Only changed for tests against a local stand-in for YouCam. */
  YOUCAM_API_BASE: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.url({ protocol: /^https?$/ }).default("https://yce-api-01.makeupar.com"),
  ),
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

/** Values pasted into a dashboard often pick up a stray space or line break. Ignore it instead of failing. */
export function cleanEnv(source: Record<string, string | undefined>): Record<string, string | undefined> {
  return Object.fromEntries(Object.entries(source).map(([key, value]) => [key, value?.trim()]));
}

const parsed = envSchema.safeParse(cleanEnv(process.env));
if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`).join("\n");
  throw new Error(`Invalid environment variables:\n${issues}`);
}

export const env = parsed.data;

if (env.VERCEL_ENV === "production" && !env.YOUCAM_API_BASE.startsWith("https://")) {
  throw new Error("YOUCAM_API_BASE must use HTTPS in production. Leave it unset to use YouCam's own address.");
}

/** The server-only Supabase key. Never sent to the browser. */
export function supabaseSecretKey(): string | undefined {
  return env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_SECRET_KEY;
}

export const features = {
  // The server needs only the URL and the secret key. The public key is for browser login (Week 3).
  supabase: env.REBLOOM_STORE !== "local" && Boolean(env.NEXT_PUBLIC_SUPABASE_URL && supabaseSecretKey()),
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
