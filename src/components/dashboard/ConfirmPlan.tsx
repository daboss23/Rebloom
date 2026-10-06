"use client";

import { useState, useTransition } from "react";
import { confirmPlan } from "@/app/dashboard/actions";

/** "Confirm plan with client", on the dark plan panel (the mockup's brief). */
export function ConfirmPlan({ clientId, label = "Confirm plan with client" }: { clientId: string; label?: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const result = await confirmPlan({ clientId });
            if (!result.ok) setError(result.error ?? "Couldn't confirm the plan.");
          })
        }
        className="h-12 w-full bg-glacier text-[15px] text-ink transition-[opacity,transform] duration-200 ease-out hover:opacity-90 active:scale-[0.99] disabled:opacity-60"
      >
        {pending ? "Confirming" : label}
      </button>
      {error && (
        <p role="alert" className="mt-3 text-[13px] text-porcelain">
          {error}
        </p>
      )}
    </div>
  );
}
