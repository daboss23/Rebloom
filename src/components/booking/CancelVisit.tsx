"use client";

import { useRef, useState, useTransition } from "react";
import { cancelBooking } from "@/app/r/[token]/book/actions";
import { FormAlert } from "@/components/ui/FormAlert";

/** "Cancel this visit", confirmed in place: one quiet link, then a plain question with both answers side by side. */
export function CancelVisit({ token, appointmentId, refund, noticeHours }: { token: string; appointmentId: string; refund: string | null; noticeHours: number }) {
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const keep = useRef<HTMLButtonElement>(null);

  if (!asking) {
    return (
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="t-caption !text-[13.5px]">
          Need a different time? Cancel up to {noticeHours} hours before and choose another.{refund ? " Your deposit comes back in full." : ""}
        </p>
        <button
          type="button"
          onClick={() => {
            setAsking(true);
            requestAnimationFrame(() => keep.current?.focus());
          }}
          className="min-h-11 text-[14px] text-ink underline decoration-[#0c1a22]/30 underline-offset-4 transition-colors hover:decoration-[#0c1a22]/70"
        >
          Cancel this visit
        </button>
      </div>
    );
  }

  return (
    <div className="focus-in" role="group" aria-labelledby="cancel-q">
      <p id="cancel-q" className="text-[15px] leading-relaxed text-ink">
        Cancel this visit?{refund ? ` Your ${refund} deposit comes back to you in full.` : ""}
      </p>
      {error && (
        <div className="mt-3">
          <FormAlert>{error}</FormAlert>
        </div>
      )}
      <div className="mt-4 grid grid-cols-2 gap-2.5">
        <button ref={keep} type="button" onClick={() => setAsking(false)} disabled={pending} className="btn-ghost !h-12 text-[15px]">
          Keep my visit
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              setError(null);
              const result = await cancelBooking({ token, appointmentId });
              if (!result.ok) setError(result.error ?? "That didn't go through. Please try again.");
            })
          }
          className="btn-ghost !h-12 !border-[#9e4a5d]/30 text-[15px] !text-[#9e4a5d] hover:!border-[#9e4a5d]/60 disabled:opacity-60"
        >
          {pending ? "Cancelling" : "Yes, cancel it"}
        </button>
      </div>
    </div>
  );
}
