"use client";

// Fitzpatrick type on the brief (DECISIONS D-094). YouCam's estimate is a prompt: Dana confirms it, or picks the type
// she sees in person, and her call is kept. Treatments the clinic doesn't offer to that type leave the plan.

import { useState, useTransition } from "react";
import { setSkinType } from "@/app/dashboard/actions";
import { FITZPATRICK_TYPES, skinTypeLabel, type FitzpatrickReading, type FitzpatrickType } from "@/lib/skin/fitzpatrick";

export function SkinTypeControl({ clientId, firstName, reading }: { clientId: string; firstName: string; reading: FitzpatrickReading | null }) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const link = "text-[0.8125rem] text-text-3 underline decoration-[#0c1a22]/20 underline-offset-4 transition-colors duration-150 hover:text-ink hover:decoration-ink";

  const save = (type: FitzpatrickType) =>
    start(async () => {
      setError(null);
      const result = await setSkinType({ clientId, type });
      if (result.ok) setEditing(false);
      else setError(result.error ?? "Something went wrong. Please try again.");
    });

  if (!editing) {
    return (
      <>
        {reading ? skinTypeLabel(reading.type) : "Not read yet"}
        <span className="mt-0.5 block text-[0.8125rem] text-text-3">
          {reading?.source === "practitioner" ? "Set by the clinic" : reading ? "Estimated from the scan" : "Read on their first live scan"}
        </span>
        <span className="mt-1.5 flex gap-4">
          {reading?.source === "scan" && (
            <button type="button" disabled={pending} onClick={() => save(reading.type)} className={link}>
              {pending ? "Saving" : "Confirm"}
            </button>
          )}
          <button type="button" disabled={pending} onClick={() => setEditing(true)} className={link}>
            {reading ? "Change" : "Set it"}
          </button>
        </span>
        {error && (
          <span role="alert" className="mt-2 block text-[0.8125rem] text-ink">
            {error}
          </span>
        )}
      </>
    );
  }
  return (
    <div role="group" aria-label={`${firstName}'s Fitzpatrick type`} className="fade">
      <div className="grid max-w-60 grid-cols-6 gap-1">
        {FITZPATRICK_TYPES.map((type) => (
          <button
            key={type}
            type="button"
            disabled={pending}
            aria-pressed={reading?.type === type}
            onClick={() => save(type)}
            className="rounded-full py-1 text-[0.8125rem] tabular-nums text-ink ring-1 ring-inset ring-[#0c1a22]/15 transition-colors duration-150 hover:bg-ink hover:text-white aria-pressed:bg-ink aria-pressed:text-white disabled:opacity-60"
          >
            {type}
          </button>
        ))}
      </div>
      <p className="mt-2 text-[0.8125rem] leading-snug text-text-2">The type you see in person. Treatments not offered to it leave the plan.</p>
      <button type="button" disabled={pending} onClick={() => setEditing(false)} className={`${link} mt-1.5 block`}>
        Cancel
      </button>
      {error && (
        <p role="alert" className="mt-2 text-[0.8125rem] text-ink">
          {error}
        </p>
      )}
    </div>
  );
}
