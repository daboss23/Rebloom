"use client";

// Dana's exceptions to the skin type rule (DECISIONS D-095). A treatment the clinic doesn't usually offer to this
// client's Fitzpatrick type can be offered anyway, with her reason, kept as a record of the call. Removable.

import { useId, useState, useTransition } from "react";
import { setSkinTypeException } from "@/app/dashboard/actions";

export interface LimitedTreatment {
  id: string;
  name: string;
  /** "types I to III". */
  limit: string;
  exception: { reason: string; by: string; when: string } | null;
}

const link = "text-[0.8125rem] text-text-3 underline decoration-[#0c1a22]/20 underline-offset-4 transition-colors duration-150 hover:text-ink hover:decoration-ink";

export function SkinTypeExceptions({ clientId, firstName, type, treatments }: { clientId: string; firstName: string; type: string; treatments: LimitedTreatment[] }) {
  return (
    <div className="border-t border-[#0c1a22]/[0.07] py-4">
      <p className="t-label !text-[0.75rem]">For skin type {type}</p>
      <ul className="mt-1.5">
        {treatments.map((t) => (
          <Row key={t.id} clientId={clientId} firstName={firstName} type={type} treatment={t} />
        ))}
      </ul>
    </div>
  );
}

function Row({ clientId, firstName, type, treatment }: { clientId: string; firstName: string; type: string; treatment: LimitedTreatment }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const field = useId();

  const send = (value: string | undefined) =>
    start(async () => {
      setError(null);
      const result = await setSkinTypeException({ clientId, treatmentId: treatment.id, reason: value });
      if (!result.ok) return setError(result.error ?? "Something went wrong. Please try again.");
      setOpen(false);
      setReason("");
    });

  return (
    <li className="py-1.5 text-[0.9375rem] text-ink">
      {treatment.exception ? (
        <>
          {treatment.name}: offered anyway
          <span className="mt-0.5 block text-[0.8125rem] text-text-3">
            &ldquo;{treatment.exception.reason}&rdquo; · {treatment.exception.by}, {treatment.exception.when}
          </span>
          <button type="button" disabled={pending} onClick={() => send(undefined)} className={`${link} mt-1`}>
            {pending ? "Removing" : "Remove"}
          </button>
        </>
      ) : (
        <>
          {treatment.name}: not offered
          <span className="mt-0.5 block text-[0.8125rem] text-text-3">The clinic offers it to skin {treatment.limit}.</span>
          {!open && (
            <button type="button" onClick={() => setOpen(true)} className={`${link} mt-1`}>
              Offer anyway
            </button>
          )}
          {open && (
            <form
              className="fade mt-2 max-w-md"
              onSubmit={(e) => {
                e.preventDefault();
                send(reason);
              }}
            >
              <label htmlFor={field} className="text-[0.8125rem] leading-snug text-text-2">
                Why offer {treatment.name} to {firstName}, at type {type}? Kept with their record.
              </label>
              <input
                id={field}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={200}
                placeholder="Patch test clear"
                autoFocus
                className="mt-1.5 block w-full rounded-xl border border-[#0c1a22]/15 bg-white/80 px-3 py-2 text-[0.9375rem] text-ink outline-none transition-colors duration-150 placeholder:text-text-3 focus:border-ink"
              />
              <div className="mt-2 flex items-center gap-4">
                <button
                  type="submit"
                  disabled={pending || reason.trim().length < 3}
                  className="rounded-full bg-ink px-3.5 py-1.5 text-[0.8125rem] text-white transition-colors duration-150 hover:bg-[#1b2c36] disabled:opacity-60"
                >
                  {pending ? "Saving" : `Offer to ${firstName}`}
                </button>
                <button type="button" disabled={pending} onClick={() => setOpen(false)} className={link}>
                  Cancel
                </button>
              </div>
            </form>
          )}
        </>
      )}
      {error && (
        <span role="alert" className="mt-2 block text-[0.8125rem] text-ink">
          {error}
        </span>
      )}
    </li>
  );
}
