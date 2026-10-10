"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { saveIntakeStep } from "@/app/c/[clinicSlug]/actions";
import { prefetchFaceGuide } from "@/components/capture/landmarker";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { FieldLabel, TextArea, TextInput } from "@/components/ui/Field";
import { IconArrowLeft } from "@/components/ui/Icons";
import { FormAlert } from "@/components/ui/FormAlert";
import type {
  AgeRange,
  BudgetBand,
  EventType,
  IntakeConcern,
  PastTreatment,
  ScreeningAnswer,
  ScreeningKey,
} from "@/lib/domain";
import {
  AGE_OPTIONS,
  BUDGET_OPTIONS,
  CONCERN_OPTIONS,
  EVENT_OPTIONS,
  SCREENING_QUESTIONS,
  TREATMENT_OPTIONS,
} from "@/lib/flow/intake-options";
import { INTAKE_STEPS, type IntakeStep } from "@/lib/flow/intake-schema";

export interface IntakeAnswers {
  concerns: IntakeConcern[];
  concernsOther: string;
  goalText: string;
  hasEvent: boolean | null;
  eventType: EventType | null;
  eventDate: string;
  pastTreatments: PastTreatment[];
  budgetBand: BudgetBand | null;
  screening: Partial<Record<ScreeningKey, ScreeningAnswer>>;
  sensitivitiesNote: string;
  ageRange: AgeRange | null;
}

function firstIncomplete(a: IntakeAnswers): number {
  if (a.concerns.length === 0) return 0;
  if (a.hasEvent === null) return 2;
  if (a.pastTreatments.length === 0) return 3;
  if (!a.budgetBand) return 4;
  return 6;
}

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

function payload(step: IntakeStep, a: IntakeAnswers): unknown {
  switch (step) {
    case "concerns":
      return { concerns: a.concerns, concernsOther: a.concerns.includes("other") ? a.concernsOther : "" };
    case "goal":
      return { goalText: a.goalText };
    case "event":
      return { hasEvent: a.hasEvent, eventType: a.hasEvent ? a.eventType : null, eventDate: a.hasEvent ? a.eventDate || null : null };
    case "treatments":
      return { pastTreatments: a.pastTreatments };
    case "budget":
      return { budgetBand: a.budgetBand };
    case "screening":
      return { screening: a.screening, sensitivitiesNote: a.screening.sensitivities === "yes" ? a.sensitivitiesNote : "" };
    case "about":
      return { ageRange: a.ageRange };
  }
}

function canContinue(step: IntakeStep, a: IntakeAnswers): boolean {
  switch (step) {
    case "concerns":
      return a.concerns.length > 0;
    case "event":
      return a.hasEvent === false || (a.hasEvent === true && Boolean(a.eventType && a.eventDate));
    case "treatments":
      return a.pastTreatments.length > 0;
    case "budget":
      return a.budgetBand !== null;
    default:
      return true;
  }
}

export function IntakeFlow({ clinicSlug, initial, today }: { clinicSlug: string; initial: IntakeAnswers; today: string }) {
  const router = useRouter();
  const [answers, setAnswers] = useState(initial);
  const [index, setIndex] = useState(() => firstIncomplete(initial));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);

  const step = INTAKE_STEPS[index];
  const set = (patch: Partial<IntakeAnswers>) => {
    setError(null);
    setAnswers((a) => ({ ...a, ...patch }));
  };

  // Download the camera's face guide while they answer, so the camera opens straight away afterwards.
  useEffect(() => {
    const timer = window.setTimeout(prefetchFaceGuide, 1500);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    window.scrollTo({ top: 0 });
    headingRef.current?.focus();
  }, [index]);

  function next() {
    startTransition(async () => {
      const result = await saveIntakeStep(clinicSlug, { step, data: payload(step, answers) });
      if (!result.ok) {
        setError(result.error ?? "Please check your answer.");
        return;
      }
      if (index === INTAKE_STEPS.length - 1) router.push(`/c/${clinicSlug}/capture`);
      else setIndex(index + 1);
    });
  }

  return (
    <div className="pt-8">
      <div className="flex h-11 items-center justify-between">
        {index > 0 ? (
          <button
            type="button"
            onClick={() => setIndex(index - 1)}
            className="group -ml-2 inline-flex min-h-11 items-center gap-2 rounded-full px-2 text-[0.875rem] text-text-2 transition-colors duration-200 hover:text-ink"
          >
            <IconArrowLeft width={18} height={18} className="transition-transform duration-200 group-hover:-translate-x-0.5" /> Back
          </button>
        ) : (
          <span />
        )}
        <span className="text-[0.75rem] uppercase tracking-[0.22em] text-[#1e5a78]">
          {index + 1} of {INTAKE_STEPS.length}
        </span>
      </div>
      {/* One segment per question, each filling from ice to sea as it's reached. */}
      <div className="mt-2 grid gap-1.5" style={{ gridTemplateColumns: `repeat(${INTAKE_STEPS.length}, 1fr)` }} aria-hidden>
        {INTAKE_STEPS.map((s, i) => (
          <span key={s} className="h-1.5 overflow-hidden rounded-full bg-[#0c1a22]/[0.08]">
            <span
              className="block h-full origin-left rounded-full bg-[linear-gradient(90deg,#9fc9dd_0%,#1e5a78_100%)] transition-transform duration-500 ease-out"
              style={{ transform: `scaleX(${i <= index ? 1 : 0})` }}
            />
          </span>
        ))}
      </div>

      <form
        key={step}
        className="focus-in mt-10"
        onSubmit={(e) => {
          e.preventDefault();
          if (canContinue(step, answers)) next();
        }}
      >
        <Step step={step} answers={answers} set={set} today={today} headingRef={headingRef} />

        {error && (
          <div className="mt-6">
            <FormAlert>{error}</FormAlert>
          </div>
        )}

        {/*
          On the one long question, the way on stays in reach on a phone. The pinned bar is kept slim, and its
          "optional" note sits under the question instead, so the first question still shows on a small phone.
        */}
        <div
          className={
            step === "screening"
              ? "sticky bottom-0 z-10 -mx-5 mt-10 bg-[linear-gradient(180deg,rgba(237,243,246,0)_0%,rgba(237,243,246,0.96)_40%,#edf3f6_70%)] px-5 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-5"
              : "mt-10"
          }
        >
          <Button type="submit" block disabled={!canContinue(step, answers) || pending} className="!min-h-14 text-[1rem]">
            {pending ? "Saving" : step === "about" ? "Continue to your photo" : "Continue"}
          </Button>
          {step === "goal" && <p className="t-caption mt-3 text-center">This one is optional. You can continue without answering.</p>}
        </div>
      </form>
    </div>
  );
}

function Question({ title, hint, headingRef }: { title: string; hint?: string; headingRef: React.Ref<HTMLHeadingElement> }) {
  return (
    <>
      <h1 ref={headingRef} tabIndex={-1} className="font-display text-[clamp(32px,8.4vw,42px)] font-light leading-[1.08] tracking-[-0.015em] text-ink outline-none [text-wrap:balance]">
        {title}
      </h1>
      {hint && <p className="mt-3 text-[1rem] leading-relaxed text-text-2">{hint}</p>}
    </>
  );
}

function ChipGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={label} className="mt-8 flex flex-wrap gap-2">
      {children}
    </div>
  );
}

function Step({
  step,
  answers: a,
  set,
  today,
  headingRef,
}: {
  step: IntakeStep;
  answers: IntakeAnswers;
  set: (patch: Partial<IntakeAnswers>) => void;
  today: string;
  headingRef: React.Ref<HTMLHeadingElement>;
}) {
  switch (step) {
    case "concerns":
      return (
        <>
          <Question
            headingRef={headingRef}
            title="What bothers you most when you look in the mirror?"
            hint="Choose as many as you like."
          />
          <ChipGroup label="Concerns">
            {CONCERN_OPTIONS.map(([value, label]) => (
              <Chip key={value} selected={a.concerns.includes(value)} onClick={() => set({ concerns: toggle(a.concerns, value) })}>
                {label}
              </Chip>
            ))}
          </ChipGroup>
          {a.concerns.includes("other") && (
            <div className="mt-6">
              <FieldLabel htmlFor="concernsOther" optional>
                Tell us a little more
              </FieldLabel>
              <TextInput id="concernsOther" value={a.concernsOther} maxLength={120} onChange={(e) => set({ concernsOther: e.target.value })} />
            </div>
          )}
        </>
      );

    case "goal":
      return (
        <>
          <Question
            headingRef={headingRef}
            title="In your own words, what would you like to change?"
            hint="Your practitioner reads this before you meet."
          />
          <div className="mt-8">
            <label htmlFor="goalText" className="sr-only">
              What you would like to change
            </label>
            <TextArea
              id="goalText"
              value={a.goalText}
              maxLength={600}
              placeholder="For example: my skin looks uneven in photos, and I'd like it smoother for my wedding."
              onChange={(e) => set({ goalText: e.target.value })}
            />
          </div>
        </>
      );

    case "event":
      return (
        <>
          <Question headingRef={headingRef} title="Any event coming up?" hint="If there's a date, we'll plan around it, with rest time built in." />
          <ChipGroup label="Event coming up">
            <Chip selected={a.hasEvent === false} onClick={() => set({ hasEvent: false })}>
              Nothing planned
            </Chip>
            <Chip selected={a.hasEvent === true} onClick={() => set({ hasEvent: true })}>
              Yes, there&apos;s a date
            </Chip>
          </ChipGroup>
          {a.hasEvent && (
            <div className="mt-8 fade">
              <p className="t-label mb-3">What is it?</p>
              <div role="group" aria-label="Event type" className="flex flex-wrap gap-2">
                {EVENT_OPTIONS.map(([value, label]) => (
                  <Chip key={value} selected={a.eventType === value} onClick={() => set({ eventType: value })}>
                    {label}
                  </Chip>
                ))}
              </div>
              <div className="mt-6">
                <FieldLabel htmlFor="eventDate">Date</FieldLabel>
                <TextInput id="eventDate" type="date" min={today} value={a.eventDate} onChange={(e) => set({ eventDate: e.target.value })} />
              </div>
            </div>
          )}
        </>
      );

    case "treatments":
      return (
        <>
          <Question headingRef={headingRef} title="Have you had any treatments before?" hint="Choose all that apply." />
          <ChipGroup label="Past treatments">
            {TREATMENT_OPTIONS.map(([value, label]) => (
              <Chip
                key={value}
                selected={a.pastTreatments.includes(value)}
                onClick={() =>
                  set({
                    pastTreatments:
                      value === "none" ? (a.pastTreatments.includes("none") ? [] : ["none"]) : toggle(a.pastTreatments.filter((t) => t !== "none"), value),
                  })
                }
              >
                {label}
              </Chip>
            ))}
          </ChipGroup>
        </>
      );

    case "budget":
      return (
        <>
          <Question
            headingRef={headingRef}
            title="Roughly what would you like to invest?"
            hint="Across a full course of treatment. We always show prices upfront."
          />
          <ChipGroup label="Budget">
            {BUDGET_OPTIONS.map(([value, label]) => (
              <Chip key={value} selected={a.budgetBand === value} onClick={() => set({ budgetBand: value })}>
                {label}
              </Chip>
            ))}
          </ChipGroup>
        </>
      );

    case "screening":
      return (
        <>
          <Question
            headingRef={headingRef}
            title="A few routine questions."
            hint="Clinics ask everyone these before treatment. Your answers never rule anything out. They simply help your practitioner prepare."
          />
          <p className="t-caption mt-2">Optional. Skip any you&apos;d rather talk through in person.</p>
          <div className="glass mt-8 divide-y divide-[#0c1a22]/[0.07] px-5">
            {SCREENING_QUESTIONS.map(([key, question]) => (
              <div key={key} className="py-5">
                <p id={`q-${key}`} className="text-[0.96875rem] leading-snug text-ink">
                  {question}
                </p>
                <div role="group" aria-labelledby={`q-${key}`} className="mt-3 flex flex-wrap gap-2">
                  {(["yes", "no", "unsure"] as const).map((value) => (
                    <Chip
                      key={value}
                      className="min-w-20 justify-center text-center"
                      selected={a.screening[key] === value}
                      onClick={() => set({ screening: { ...a.screening, [key]: value } })}
                    >
                      {value === "yes" ? "Yes" : value === "no" ? "No" : "Not sure"}
                    </Chip>
                  ))}
                </div>
                {key === "sensitivities" && a.screening.sensitivities === "yes" && (
                  <div className="mt-4">
                    <FieldLabel htmlFor="sensitivitiesNote" optional>
                      What are you sensitive to?
                    </FieldLabel>
                    <TextInput
                      id="sensitivitiesNote"
                      value={a.sensitivitiesNote}
                      maxLength={200}
                      onChange={(e) => set({ sensitivitiesNote: e.target.value })}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      );

    case "about":
      return (
        <>
          <Question
            headingRef={headingRef}
            title="Last one. Your age range?"
            hint="Optional. It helps your practitioner read your scan in context."
          />
          <div className="mt-8 space-y-6">
            <div>
              <p className="t-label mb-3 flex justify-between">
                <span>Age range</span>
                <span className="normal-case tracking-normal text-[0.8125rem]">Optional</span>
              </p>
              <div role="group" aria-label="Age range" className="flex flex-wrap gap-2">
                {AGE_OPTIONS.map(([value, label]) => (
                  <Chip key={value} selected={a.ageRange === value} onClick={() => set({ ageRange: a.ageRange === value ? null : value })}>
                    {label}
                  </Chip>
                ))}
              </div>
            </div>
          </div>
        </>
      );
  }
}
