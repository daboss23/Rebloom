"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { giveConsent, type ActionResult } from "@/app/c/[clinicSlug]/actions";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Field";

export function ConsentForm({ clinicSlug, clinicName }: { clinicSlug: string; clinicName: string }) {
  const [agreed, setAgreed] = useState(false);
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(giveConsent.bind(null, clinicSlug), null);

  return (
    <form action={action} className="mt-10 space-y-6">
      <Checkbox id="biometric" name="biometric" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} required>
        I agree to {clinicName} analyzing a photo of my face as described above. I understand this involves processing
        biometric data from my face image.
      </Checkbox>
      <Checkbox id="reminders" name="reminders">
        Email me when it&apos;s time for a progress scan. <span className="text-text-3">Optional.</span>
      </Checkbox>

      {state?.error && (
        <p role="alert" className="text-[14px] text-ink border-l border-bronze pl-3">
          {state.error}
        </p>
      )}

      <div className="pt-2">
        <Button type="submit" block disabled={!agreed || pending}>
          {pending ? "One moment" : "Continue"}
        </Button>
        <p className="t-caption mt-4 text-center">
          Read the full{" "}
          <Link href="/privacy" className="underline underline-offset-4">
            privacy notice
          </Link>
          .
        </p>
      </div>
    </form>
  );
}
