"use client";

import { useActionState } from "react";
import { unlockReport, type ActionResult } from "@/app/c/[clinicSlug]/actions";
import { Button } from "@/components/ui/Button";
import { Checkbox, FieldLabel, TextInput } from "@/components/ui/Field";
import { Label } from "@/components/ui/Typography";

// Placeholder shapes for the blurred report. Deliberately not the client's real scores:
// those stay on the server until they opt in (brief 3.1 step 6).
const GHOST_ROWS = [
  { label: "Texture", width: "58%" },
  { label: "Pigmentation", width: "64%" },
  { label: "Pores", width: "71%" },
];

export function ReportGate({ clinicSlug, scanId, demo }: { clinicSlug: string; scanId: string; demo: boolean }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(
    unlockReport.bind(null, clinicSlug, scanId),
    null,
  );

  return (
    <div className="relative pt-10 pb-8 reveal">
      {/* The report, already written, sitting just out of focus. */}
      <div aria-hidden className="pointer-events-none select-none blur-[5px] opacity-90">
        <p className="t-label">Your report</p>
        <p className="t-h1 mt-4">Your skin is telling a clear story.</p>
        {/* eslint-disable-next-line @next/next/no-img-element -- server-blurred, private, never cached */}
        <img src={`/api/scans/${scanId}/preview`} alt="" className="mt-8 w-full aspect-[3/4] object-cover bg-mist" />
        <p className="t-h2 mt-12">Your three priorities</p>
        <ol className="mt-6">
          {GHOST_ROWS.map((row, i) => (
            <li key={row.label} className="border-t border-mist py-6">
              <p className="t-label">{String(i + 1).padStart(2, "0")}</p>
              <p className="t-h3 mt-1">{row.label}</p>
              <div className="mt-3 h-[3px] bg-mist">
                <div className="h-full bg-accent" style={{ width: row.width }} />
              </div>
            </li>
          ))}
        </ol>
      </div>

      <div className="absolute inset-x-0 top-[340px] flex justify-center">
        <form
          action={action}
          className="w-full bg-porcelain border border-mist px-6 py-8 shadow-[0_24px_60px_-30px_rgba(0,0,0,0.35)] space-y-5"
          aria-labelledby="gate-title"
        >
          <Label>Analysis complete</Label>
          <h1 id="gate-title" className="t-h2">
            Your report is ready.
          </h1>
          <p className="t-body">
            Tell us where to send it and it opens right here. Your private link arrives by email so you can come back to
            it after every scan.
          </p>
          <div>
            <FieldLabel htmlFor="firstName">First name</FieldLabel>
            <TextInput id="firstName" name="firstName" autoComplete="given-name" maxLength={60} required />
          </div>
          <div>
            <FieldLabel htmlFor="email">Email</FieldLabel>
            <TextInput id="email" name="email" type="email" inputMode="email" autoComplete="email" required />
          </div>
          <div>
            <FieldLabel htmlFor="phone" optional>
              Phone
            </FieldLabel>
            <TextInput id="phone" name="phone" type="tel" autoComplete="tel" maxLength={30} />
          </div>
          <Checkbox id="reminders" name="reminders">
            Email me when it&apos;s time for a progress scan. <span className="text-text-3">Optional.</span>
          </Checkbox>

          {state?.error && (
            <p role="alert" className="text-[14px] text-ink border-l border-bronze pl-3">
              {state.error}
            </p>
          )}

          <Button type="submit" block disabled={pending}>
            {pending ? "Opening your report" : "See my report"}
          </Button>
          <p className="t-caption text-center">Private to you. No spam, and you can delete your data at any time.</p>
          {demo && <p className="t-caption text-center">Demo analysis: results are sample data.</p>}
        </form>
      </div>
    </div>
  );
}
