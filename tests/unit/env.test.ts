import { describe, expect, it } from "vitest";
import { cleanEnv, envSchema } from "@/lib/env";

const parse = (vars: Record<string, string>) => envSchema.parse(cleanEnv(vars));

describe("environment variables", () => {
  it("ignores stray spaces and line breaks pasted with a value", () => {
    const env = parse({ SUPABASE_SERVICE_ROLE_KEY: "  sb_secret_abc\n", NEXT_PUBLIC_SUPABASE_URL: "https://x.supabase.co " });
    expect(env.SUPABASE_SERVICE_ROLE_KEY).toBe("sb_secret_abc");
    expect(env.NEXT_PUBLIC_SUPABASE_URL).toBe("https://x.supabase.co");
  });

  it("accepts choices in any case", () => {
    expect(parse({ YOUCAM_MODE: "Live" }).YOUCAM_MODE).toBe("live");
    expect(parse({ YOUCAM_MODE: " FIXTURE " }).YOUCAM_MODE).toBe("fixture");
    expect(parse({ REBLOOM_STORE: "Local" }).REBLOOM_STORE).toBe("local");
  });

  it("treats blank values as not set", () => {
    const env = parse({ YOUCAM_MODE: "   ", SUPABASE_SECRET_KEY: "" });
    expect(env.YOUCAM_MODE).toBe("fixture");
    expect(env.SUPABASE_SECRET_KEY).toBeUndefined();
  });

  it("still refuses values that are actually wrong", () => {
    expect(() => parse({ YOUCAM_MODE: "on" })).toThrow();
    expect(() => parse({ STRIPE_SECRET_KEY: "sk_live_123" })).toThrow();
  });
});
