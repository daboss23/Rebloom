"use client";

// "Stop emails" on the brief (DECISIONS D-086): for a client who asked the clinic, by a reply or on the phone. Two
// steps, since only the client can take it back, from the link in any email.

import { useState, useTransition } from "react";
import { stopEmails } from "@/app/dashboard/actions";

export function StopEmails({ clientId, firstName }: { clientId: string; firstName: string }) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const link = "text-[0.8125rem] text-text-3 underline decoration-[#0c1a22]/20 underline-offset-4 transition-colors duration-150 hover:text-ink hover:decoration-ink tap";

  if (!confirming) {
    return (
      <button type="button" onClick={() => setConfirming(true)} className={`${link} mt-1.5 block`}>
        Stop emails
      </button>
    );
  }
  return (
    <div role="group" aria-label={`Stop emails to ${firstName}`} className="fade mt-2">
      <p className="text-[0.8125rem] leading-snug text-text-2">Only when {firstName} asks. They can turn emails back on from any email&apos;s link.</p>
      <div className="mt-2 flex items-center gap-4">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              setError(null);
              const result = await stopEmails({ clientId });
              if (!result.ok) setError(result.error ?? "Something went wrong. Please try again.");
            })
          }
          className="rounded-full bg-ink px-3.5 py-1.5 text-[0.8125rem] text-white transition-colors duration-150 hover:bg-[#1b2c36] disabled:opacity-60"
        >
          {pending ? "Stopping" : "Stop emails"}
        </button>
        <button type="button" disabled={pending} onClick={() => setConfirming(false)} className={link}>
          Cancel
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-[0.8125rem] text-ink">
          {error}
        </p>
      )}
    </div>
  );
}
