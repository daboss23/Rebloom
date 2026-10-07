// The suggested plan, kept: the rows a computed plan becomes once someone agrees to it, with today's menu prices
// fixed (DECISIONS D-055). The practitioner's "Confirm plan" and a client booking from their report both use it.

import type { ClientPlan, PlanItem, PlanStatus } from "@/lib/domain";
import { newId } from "@/lib/ids";
import type { Plan } from "./build";

export function keptPlan(input: {
  plan: Plan;
  clientId: string;
  scanId: string;
  status: Extract<PlanStatus, "proposed" | "confirmed">;
  confirmedBy: string | null;
  now: Date;
}): { plan: ClientPlan; items: PlanItem[] } {
  const planId = newId();
  const lines = input.plan.recommended.lines;
  const firstSession = (treatmentId: string) =>
    input.plan.timeline.find((s) => s.kind === "session" && s.treatment.id === treatmentId && s.first);
  const items: PlanItem[] = [
    ...lines.map((line, position) => ({
      id: newId(),
      planId,
      treatmentId: line.treatment.id,
      productId: null,
      quantity: line.sessions,
      unitPriceCents: line.treatment.priceCents,
      position,
      targetDate: firstSession(line.treatment.id)?.date ?? null,
    })),
    ...input.plan.homeCare.map(({ product }, i) => ({
      id: newId(),
      planId,
      treatmentId: null,
      productId: product.id,
      quantity: 1,
      unitPriceCents: product.priceCents,
      position: lines.length + i,
      targetDate: null,
    })),
  ];
  const at = input.now.toISOString();
  return {
    plan: {
      id: planId,
      clientId: input.clientId,
      scanId: input.scanId,
      status: input.status,
      confirmedBy: input.status === "confirmed" ? input.confirmedBy : null,
      confirmedAt: input.status === "confirmed" ? at : null,
      totalCents: items.reduce((n, i) => n + i.quantity * i.unitPriceCents, 0),
      createdAt: at,
    },
    items,
  };
}
