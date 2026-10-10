"use client";

import { useState, useTransition } from "react";
import { setDepositRequired } from "@/app/dashboard/actions";
import { cx } from "@/components/ui/cx";

/** The owner's switch for deposits at booking (DECISIONS D-066). Flips at once, and flips back if saving fails. */
export function DepositSwitch({ initial, amount }: { initial: boolean; amount: string }) {
  const [on, setOn] = useState(initial);
  const [status, setStatus] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const flip = () => {
    // Ignored while saving, without disabling the button: a disabled button drops keyboard focus.
    if (pending) return;
    const next = !on;
    setOn(next);
    setStatus(null);
    start(async () => {
      const result = await setDepositRequired({ on: next });
      if (!result.ok) setOn(!next);
      setStatus(result.ok ? (result.message ?? null) : (result.error ?? "That didn't save. Please try again."));
    });
  };

  return (
    <div>
      <div className="flex items-center justify-between gap-6">
        <span id="deposit-label" className="text-[0.9375rem] text-ink">
          Take a {amount} deposit at booking
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-labelledby="deposit-label"
          aria-describedby="deposit-help"
          aria-disabled={pending}
          onClick={flip}
          className={cx(
            "relative h-[30px] w-[52px] shrink-0 rounded-full transition-[background-color,box-shadow] duration-300 ease-out aria-disabled:cursor-wait",
            on
              ? "bg-[linear-gradient(180deg,#23668a_0%,#134560_100%)] shadow-[inset_0_1px_0_rgba(255,255,255,0.28),0_8px_18px_-10px_rgba(19,69,96,0.8)]"
              : "bg-[#0c1a22]/[0.12] shadow-[inset_0_1px_2px_rgba(12,26,34,0.12)]",
          )}
        >
          <span
            aria-hidden
            className={cx(
              "absolute left-[3px] top-[3px] h-6 w-6 rounded-full bg-white shadow-[0_2px_6px_rgba(12,26,34,0.25)] transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
              on && "translate-x-[22px]",
            )}
          />
        </button>
      </div>
      <p id="deposit-help" className="t-caption mt-2 max-w-xl !text-[0.8125rem]">
        {on
          ? `Clients pay ${amount} through Stripe to hold their time. It goes toward the visit and comes back in full if they cancel up to 24 hours before.`
          : "Clients choose a time and they're booked. No payment is taken until the visit."}
      </p>
      <p aria-live="polite" className="mt-2 min-h-[1.25em] text-[0.8125rem] text-[#1e5a78]">
        {status}
      </p>
    </div>
  );
}
