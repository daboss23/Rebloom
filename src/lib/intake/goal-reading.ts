// Claude's reading of the client's own words (DECISIONS D-079): the rules that decide what may be said back to them.
// No server imports, so the report, the plan and the tests can all use it.

import { z } from "zod";
import { checkCopy } from "@/lib/copy/check";
import type { GoalReading, Intake } from "@/lib/domain";
import { concernLabel, SCORED_CONCERNS, type ConcernKey } from "@/lib/skin/concerns";

/** Everything the client wrote in their own words, exactly as a reading is keyed to it. */
export function goalWords(intake: Pick<Intake, "goalText" | "concernsOther">): string {
  return [intake.goalText, intake.concernsOther].filter(Boolean).join(" ").trim();
}

/** What Claude returns: the measurements their words point to, each with a phrase to say back. */
export const readingSchema = z.object({
  concerns: z.array(z.object({ key: z.enum(SCORED_CONCERNS), phrase: z.string() })),
});

export const MAX_READ_CONCERNS = 4;

/** Lowercase words, spaces, apostrophes and hyphens: reads after "You told us about" and "Part of the". */
const PHRASE = /^[a-z][a-z' -]*[a-z]$/;

/**
 * Keeps what can safely be said back. A concern Claude found always stays; a phrase that breaks the copy rules,
 * runs long or carries punctuation is replaced with the concern's own name.
 */
export function cleanReading(raw: z.infer<typeof readingSchema>): GoalReading["concerns"] {
  const out: GoalReading["concerns"] = [];
  const seen = new Set<ConcernKey>();
  for (const { key, phrase } of raw.concerns) {
    if (seen.has(key)) continue;
    seen.add(key);
    const said = phrase.trim().toLowerCase().replace(/’/g, "'").replace(/\s+/g, " ");
    const safe = PHRASE.test(said) && said.length <= 40 && said.split(" ").length <= 5 && checkCopy(said).length === 0;
    out.push({ key, phrase: safe ? said : concernLabel(key).toLowerCase() });
    if (out.length === MAX_READ_CONCERNS) break;
  }
  return out;
}

/** The reading for what they wrote now, or null: none yet, or they changed their words since. */
export function currentReading(intake: Intake): GoalReading["concerns"] | null {
  const words = goalWords(intake);
  return words && intake.goalReading?.text === words ? intake.goalReading.concerns : null;
}
