"use client";

import { useState, useTransition } from "react";
import { deleteMyData } from "@/app/r/[token]/actions";
import { Button } from "@/components/ui/Button";

/** Two steps, so nobody deletes their data by accident. */
export function DeleteData({ token }: { token: string }) {
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  if (!confirming) {
    return (
      <button type="button" onClick={() => setConfirming(true)} className="underline underline-offset-4 text-ink min-h-11">
        Delete my data
      </button>
    );
  }
  return (
    <div className="mt-4 border border-mist p-5 fade" role="alertdialog" aria-labelledby="delete-title">
      <p id="delete-title" className="t-h3">
        Delete your photos and details?
      </p>
      <p className="t-body mt-2">
        This removes your photos, scores, answers and contact details, and this link stops working. It can&apos;t be
        undone.
      </p>
      <div className="mt-5 flex flex-col sm:flex-row gap-3">
        <Button disabled={pending} onClick={() => startTransition(() => deleteMyData(token))} className="sm:flex-1">
          {pending ? "Deleting" : "Yes, delete everything"}
        </Button>
        <Button variant="secondary" disabled={pending} onClick={() => setConfirming(false)} className="sm:flex-1">
          Keep my report
        </Button>
      </div>
    </div>
  );
}
