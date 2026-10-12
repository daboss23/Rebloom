// Part 3 of the agent (DECISIONS D-093): when the scans can be trusted and a client's progress has really stopped,
// the agent proposes a change of plan. It chooses; code checks the choice. Only the clinic's active menu, only a
// treatment that works on the concerns that stalled, never the course that stalled, a sensible number of sessions,
// and the price worked out here, never one the clinic doesn't offer to the client's skin type (D-094). Screening answers come back as prompts for Dana, never reasons to refuse. Pure.

import type { PlanSuggestion } from "@/lib/domain";
import { formatPrice } from "@/lib/plan/build";
import { priorityKeys } from "@/lib/rebook/engine";
import { concernLabel } from "@/lib/skin/concerns";
import { limitLabel, suitsSkinType } from "@/lib/skin/fitzpatrick";
import { currentCourse, flagsFor, type AgentContext } from "./context";

export type Change = NonNullable<PlanSuggestion["change"]>;

export type ChangeCheck = { ok: true; change: Change; summary: string } | { ok: false; error: string };

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Checks and prices the agent's proposal. An error says what to choose instead, so the agent can try again. */
export function checkChange(ctx: AgentContext, proposal: { treatment: string; sessions: number; why: string }): ChangeCheck {
  const keys = priorityKeys(ctx.facts);
  const names = ctx.treatments.map((t) => t.name);
  const treatment = ctx.treatments.find((t) => t.id === proposal.treatment || norm(t.name) === norm(proposal.treatment));
  if (!treatment) return { ok: false, error: `"${proposal.treatment}" isn't on ${ctx.clinic.name}'s menu. Choose one of: ${names.join(", ")}.` };

  const stalled = currentCourse(ctx);
  if (stalled && stalled.id === treatment.id) {
    return { ok: false, error: `${treatment.name} is the course that stalled. Suggest a different treatment, or ask for a rescan if the scans can't be trusted.` };
  }
  // Never a treatment the clinic doesn't offer to this skin type (D-094).
  const skinType = ctx.facts.client.fitzpatrick?.type;
  if (!suitsSkinType(treatment, skinType)) {
    return { ok: false, error: `${treatment.name} isn't offered to skin type ${skinType} at ${ctx.clinic.name} (skin ${limitLabel(treatment.fitzpatrickMax)} only). Choose another treatment.` };
  }
  const covers = treatment.concerns.filter((k) => keys.includes(k));
  if (covers.length === 0) {
    const fitting = ctx.treatments
      .filter((t) => t.id !== stalled?.id && suitsSkinType(t, skinType) && t.concerns.some((k) => keys.includes(k)))
      .map((t) => t.name);
    return {
      ok: false,
      error: `${treatment.name} doesn't work on their priorities (${keys.map((k) => concernLabel(k).toLowerCase()).join(", ")}).${fitting.length ? ` Treatments that do: ${fitting.join(", ")}.` : ""}`,
    };
  }
  const most = treatment.sessionsTypical ?? 3;
  if (!Number.isInteger(proposal.sessions) || proposal.sessions < 1 || proposal.sessions > most) {
    return { ok: false, error: `Choose between 1 and ${most} sessions of ${treatment.name}.` };
  }
  const why = proposal.why.trim();
  if (why.length < 10) return { ok: false, error: "Say in a sentence why this change, for Dana." };

  const priceCents = treatment.priceCents * proposal.sessions;
  const flags = flagsFor(ctx, treatment);
  const change: Change = {
    treatmentId: treatment.id,
    treatmentName: treatment.name,
    sessions: proposal.sessions,
    priceCents,
    replacesTreatmentId: stalled?.id ?? null,
    replacesName: stalled?.name ?? null,
    covers,
    flags,
    why: why.slice(0, 400),
  };
  const event = ctx.facts.intake?.hasEvent && ctx.facts.intake.eventDate && treatment.minDaysBeforeEvent > 0
    ? ` It can't fall within ${treatment.minDaysBeforeEvent} days before their event on ${ctx.facts.intake.eventDate}.`
    : "";
  return {
    ok: true,
    change,
    summary: [
      `Recorded for ${ctx.staffName} to review: ${treatment.name}, ${proposal.sessions} ${proposal.sessions === 1 ? "session" : "sessions"}, ${formatPrice(priceCents)}${stalled ? `, in place of ${stalled.name}` : ""}.`,
      `It works on ${covers.map((k) => concernLabel(k).toLowerCase()).join(" and ")}.${event}`,
      flags.length ? `Screening answers ${ctx.staffName} will check first: ${flags.join(" ")}` : "No screening answers bear on it.",
      `Nothing changes until ${ctx.staffName} agrees it with the client. In the message, suggest talking it through; don't present it as decided.`,
    ].join(" "),
  };
}
