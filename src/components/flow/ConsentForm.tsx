"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { giveConsent, type ActionResult } from "@/app/c/[clinicSlug]/actions";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Field";
import { FormAlert } from "@/components/ui/FormAlert";

export function ConsentForm({ clinicSlug, clinicName }: { clinicSlug: string; clinicName: string }) {
  const [agreed, setAgreed] = useState(false);
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(giveConsent.bind(null, clinicSlug), null);

  return (
    <form action={action} className="mt-8 space-y-6">
      <div className="glass px-5 py-5">
        <Checkbox id="biometric" name="biometric" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} required>
          I agree to {clinicName} analyzing a photo of my face as described above. I understand this involves processing
          biometric data from my face image.
        </Checkbox>
      </div>

      {state?.error && <FormAlert>{state.error}</FormAlert>}

      <div className="pt-2">
        <Button type="submit" block disabled={!agreed || pending} className="!min-h-14 text-[16px]">
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
