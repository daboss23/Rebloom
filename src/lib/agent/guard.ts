// Every draft is checked in code before Dana sees it (DECISIONS D-093, brief 8.3: "enforce in code, not just in the
// prompt"). A draft that fails goes back to the agent with the reason, inside the same run, so it rewrites rather
// than Dana catching it. The clinic's copy rules, the voice checks, and nothing named that the tools didn't give:
// no time that wasn't checked open, no price that isn't the menu's, no link but the client's own. Pure.

import { checkCopy } from "@/lib/copy/check";
import { TEXT_MAX_CHARS } from "@/lib/sms/text";
import { allowedLink, allowedPrices, allowedTimes, pricesIn, timesIn, type AgentContext } from "./context";
import { checkVoice } from "./voice";

/** Answers are short. An email answer that runs past this has stopped being a note. */
export const EMAIL_MAX_CHARS = 1400;
/** A text answer that fits in three parts. */
export const DRAFT_TEXT_MAX_CHARS = 459;

export interface DraftFacts {
  /** Open times the agent checked in this run, as ISO instants. */
  offered: string[];
  /** Prices worked out in this run, such as a proposed change, in cents. */
  extraCents: number[];
}

/** What's wrong with a draft, as instructions to fix it. Empty when it can go to Dana. */
export function draftProblems(ctx: AgentContext, body: string, facts: DraftFacts): string[] {
  const problems: string[] = [];
  const name = ctx.facts.client.firstName ?? "";
  const text = body.trim();
  if (!text) return ["The draft is empty."];

  for (const issue of checkCopy(text)) {
    problems.push(issue.rule === "em dash" ? "Don't use em dashes. Use a full stop or a comma." : `"${issue.match}" breaks the clinic's copy rules. Reword it.`);
  }
  for (const issue of checkVoice(text)) problems.push(`"${issue.match}" reads as machine-written. Say it the way ${ctx.staffName} would.`);

  if (ctx.channel === "sms") {
    if (text.length > DRAFT_TEXT_MAX_CHARS) problems.push(`A text answer should be short: this is ${text.length} characters. Keep it under ${DRAFT_TEXT_MAX_CHARS}.`);
    if (text.length > TEXT_MAX_CHARS) problems.push(`Texts can't run past ${TEXT_MAX_CHARS} characters.`);
  } else {
    if (text.length > EMAIL_MAX_CHARS) problems.push(`Keep the email under ${EMAIL_MAX_CHARS} characters. It's a short note, not a letter.`);
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (name && !new RegExp(`^(hi|hello|dear)\\s+${escaped}(?![a-z])`, "i").test(text)) problems.push(`Open the email with "Hi ${name},".`);
    // The signature, the clinic's name and address are added under every answer.
    if (new RegExp(`\\n\\s*(-\\s*)?${ctx.staffName}\\s*$`, "i").test(text) || /\n\s*(best|warmly|kind regards|regards|thanks|cheers|xx?)[,!.]?\s*(\n.*)?$/i.test(text)) {
      problems.push(`Leave off the sign-off. ${ctx.staffName}'s name and the clinic's details are added under the email.`);
    }
  }

  const times = allowedTimes(ctx, facts.offered);
  for (const t of timesIn(text)) {
    if (!times.has(t)) {
      problems.push(
        facts.offered.length
          ? `${t} isn't one of the open times you checked. Offer only those, or check again with find_open_times.`
          : `You named ${t}, but haven't checked which times are open. Use find_open_times first, and offer only what it gives back.`,
      );
    }
  }
  const prices = allowedPrices(ctx, facts.extraCents);
  for (const p of pricesIn(text)) {
    if (!prices.has(p)) problems.push(`$${p} isn't a price on the menu or on their plan. Quote only those, exactly.`);
  }
  for (const url of text.match(/https?:\/\/\S+/g) ?? []) {
    if (!allowedLink(ctx, url)) problems.push(`${url} isn't one of their links. Use only their report, booking or rescan link, exactly as the tools give it.`);
  }
  return [...new Set(problems)];
}
