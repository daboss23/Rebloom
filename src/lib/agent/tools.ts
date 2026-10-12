// The agent's tools (DECISIONS D-093). Each one reads through code the dashboard already trusts, or records something
// that code checks first. Each also leaves a step, said plainly, so Dana can see how a draft was made: "Found
// Saturday at 10am open". Nothing here sends anything, books anything or changes a plan.

import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { AgentStep, PlanSuggestion } from "@/lib/domain";
import { formatPrice } from "@/lib/plan/build";
import { concernLabel } from "@/lib/skin/concerns";
import {
  WEEKDAYS,
  clockLabel,
  dayLabel,
  describeClient,
  describeConversation,
  describeMenu,
  describePlan,
  describeScans,
  findOpenTimes,
  type AgentContext,
} from "./context";
import { draftProblems } from "./guard";
import { checkMeasurement } from "./measure";
import { checkChange, type Change } from "./plan-change";
import { plainPunctuation } from "./voice";

/** What a run has found and recorded so far. */
export interface RunState {
  steps: AgentStep[];
  /** Open times handed back, as ISO instants. A draft may name only these. */
  offered: string[];
  measurement: PlanSuggestion["measurement"] | null;
  change: Change | null;
  submitted: { body: string; note: string } | null;
  /** Drafts sent back for another go. */
  rewrites: number;
}

export const newRunState = (): RunState => ({ steps: [], offered: [], measurement: null, change: null, submitted: null, rewrites: 0 });

/** After this many rewrites the run gives up, and Dana writes it herself. */
export const MAX_REWRITES = 3;

export function buildTools(ctx: AgentContext, state: RunState, onStep: (steps: AgentStep[]) => Promise<void> | void) {
  const name = ctx.facts.client.firstName ?? "the client";
  const step = async (text: string) => {
    if (state.steps.some((s) => s.text === text)) return;
    state.steps.push({ text, at: new Date().toISOString() });
    await onStep(state.steps);
  };

  const readConversation = betaZodTool({
    name: "read_conversation",
    description: `The latest messages between ${ctx.clinic.name} and ${name}, oldest first, with the one waiting on an answer marked.`,
    inputSchema: z.object({}),
    run: async () => {
      await step(ctx.kind === "answer" ? `Read ${name}'s message` : "Read the conversation");
      return describeConversation(ctx);
    },
  });

  const readClient = betaZodTool({
    name: "read_client",
    description: `${name}'s details: their goal in their own words, concerns, event, budget, past treatments, screening answers, and which way this draft goes.`,
    inputSchema: z.object({}),
    run: async () => {
      await step(`Checked ${name}'s goals and details`);
      return describeClient(ctx);
    },
  });

  const readScans = betaZodTool({
    name: "read_scans",
    description: `${name}'s skin scans: their priorities, the scores they see, and what changed since the first scan, with what may honestly be claimed.`,
    inputSchema: z.object({}),
    run: async () => {
      const n = ctx.facts.scans.length;
      await step(`Looked at ${n === 1 ? "their scan" : `their ${n} scans`}`);
      return describeScans(ctx);
    },
  });

  const readPlan = betaZodTool({
    name: "read_plan",
    description: `${name}'s plan: what's booked, sessions done and still to book, prices. Or, before a plan is agreed, what their report suggests.`,
    inputSchema: z.object({}),
    run: async () => {
      await step(`Checked ${name}'s plan`);
      return describePlan(ctx);
    },
  });

  const readMenu = betaZodTool({
    name: "read_menu",
    description: `${ctx.clinic.name}'s treatments and products: prices, sessions, spacing, downtime, rest before an event, and what each works on. The only treatments and prices you may name.`,
    inputSchema: z.object({}),
    run: async () => {
      await step("Checked the menu");
      return describeMenu(ctx);
    },
  });

  const findTimes = betaZodTool({
    name: "find_open_times",
    description: `Open times for the visit ${name} can book next, from the clinic's real calendar. Narrow it to what they asked for: days of the week, part of the day, not before a date.`,
    inputSchema: z.object({
      weekdays: z.array(z.enum(WEEKDAYS)).optional().describe("Only these days of the week."),
      part_of_day: z.enum(["morning", "afternoon", "evening", "any"]).optional().describe("Morning is before noon; evening from 5pm."),
      from_date: z.string().optional().describe("Not before this day, YYYY-MM-DD."),
    }),
    run: async (input) => {
      const found = findOpenTimes(ctx, { weekdays: input.weekdays, partOfDay: input.part_of_day, fromDate: input.from_date });
      for (const iso of found.offered) if (!state.offered.includes(iso)) state.offered.push(iso);
      const first = found.offered[0];
      const tz = ctx.clinic.timezone;
      await step(first ? `Found ${dayLabel(first, tz).split(",")[0]} at ${clockLabel(first, tz)} open${found.offered.length > 1 ? `, and ${found.offered.length - 1} more` : ""}` : "Checked open times");
      return found.text;
    },
  });

  const measurement = betaZodTool({
    name: "check_measurement",
    description: `Whether ${name}'s last scans can be fairly compared: the same light, the photo checks passed, the same analysis engine. Decided in code.`,
    inputSchema: z.object({}),
    run: async () => {
      state.measurement = checkMeasurement(ctx.facts.scans);
      await step(state.measurement.trustworthy ? "Checked the last scans were taken in matching light" : "Found the last scans can't be compared fairly");
      return state.measurement.trustworthy
        ? "The scans the stall was read from can be compared fairly: matching light, photo checks passed, the same engine. The stall is real."
        : `The scans can't be compared fairly, so the stall isn't proven:\n${state.measurement.reasons.map((r) => `- ${r}`).join("\n")}\nAsk for a rescan in the same light as their first scan. Their rescan link: ${ctx.facts.report ? `${ctx.origin}/r/${ctx.facts.report.token}/rescan` : "none, so ask them to reply"}.`;
    },
  });

  const suggestChange = betaZodTool({
    name: "suggest_plan_change",
    description: `Record one change to ${name}'s plan for ${ctx.staffName} to review: a treatment from the menu that works on what stalled, how many sessions, and why. Checked and priced in code.`,
    inputSchema: z.object({
      treatment: z.string().describe("The treatment's name, exactly as on the menu."),
      sessions: z.number().int().describe("How many sessions."),
      why: z.string().describe(`One or two sentences for ${ctx.staffName}: why this, for this client.`),
    }),
    run: async (input) => {
      if (!state.measurement?.trustworthy) throw new Error("Call check_measurement first. Only suggest a change when the scans can be compared fairly.");
      const result = checkChange(ctx, input);
      if (!result.ok) throw new Error(result.error);
      state.change = result.change;
      await step(`Suggested ${result.change.treatmentName} x${result.change.sessions}, ${formatPrice(result.change.priceCents)}, for ${result.change.covers.map((k) => concernLabel(k).toLowerCase()).join(" and ")}`);
      return result.summary;
    },
  });

  const submit = betaZodTool({
    name: "submit_draft",
    description: `Hand the finished ${ctx.channel === "sms" ? "text" : "email"} to ${ctx.staffName}. It's checked first; any problems come back to fix.`,
    inputSchema: z.object({
      message: z.string().describe(ctx.channel === "sms" ? "The text, as it will be sent." : `The email body, opening "Hi ${name}," with no sign-off.`),
      note_for_dana: z.string().describe(`One line for ${ctx.staffName}: what to check before sending.`),
    }),
    run: async (input) => {
      if (state.submitted) return "Already handed over. You're done.";
      const body = plainPunctuation(input.message);
      const problems = draftProblems(ctx, body, { offered: state.offered, extraCents: state.change ? [state.change.priceCents] : [] });
      if (ctx.kind === "plan_review") {
        if (!state.measurement) problems.push("Call check_measurement before drafting.");
        else if (state.measurement.trustworthy && !state.change) problems.push("The scans can be trusted, so record a change with suggest_plan_change before drafting.");
        else if (!state.measurement.trustworthy && ctx.facts.report && !body.includes(`/r/${ctx.facts.report.token}/rescan`)) {
          problems.push("The scans can't be compared, so ask for a rescan and include their rescan link.");
        }
      }
      if (problems.length > 0) {
        state.rewrites += 1;
        // Said plainly for Dana: what the check caught, which the agent then fixes.
        const caught = problems[0].split(/(?<=[a-z0-9"])\. /)[0].replace(/\.$/, "");
        await step(`Sent back to rewrite: ${caught.charAt(0).toLowerCase()}${caught.slice(1)}`);
        if (state.rewrites > MAX_REWRITES) throw new Error("Too many rewrites. Stop here; Dana will write this one herself.");
        throw new Error(`Not handed over yet. Fix these and submit again:\n${problems.map((p) => `- ${p}`).join("\n")}`);
      }
      state.submitted = { body, note: plainPunctuation(input.note_for_dana).slice(0, 300) };
      await step(`Drafted the ${ctx.channel === "sms" ? "text" : "email"}`);
      return `Handed to ${ctx.staffName}. You're done; don't write anything more.`;
    },
  });

  return [readConversation, readClient, readScans, readPlan, readMenu, findTimes, ...(ctx.kind === "plan_review" ? [measurement, suggestChange] : []), submit];
}
