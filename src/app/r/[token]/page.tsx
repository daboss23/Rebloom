import { DeleteData } from "@/components/report/DeleteData";
import { FaceMap } from "@/components/report/FaceMap";
import { HomeCare, Investment, PlanTimeline, ReadyWhenYouAre } from "@/components/report/PlanSections";
import { WhatToExpect } from "@/components/report/WhatToExpect";
import { Hairline, Label, ScoreBar, ScoreNumber } from "@/components/ui/Typography";
import { addDays, formatLongDate } from "@/lib/clock";
import { EVENT_OPTIONS } from "@/lib/flow/intake-options";
import { rankPriorities, statedConcerns } from "@/lib/plan/build";
import { loadReport, reportPlan } from "@/lib/report/load";
import { mentions, planRationale, priorityMeaning, subhead } from "@/lib/report/personal";
import { sandboxNow } from "@/lib/sandbox";
import { getStore } from "@/lib/store";
import { illustratedWeek } from "@/lib/simulation/intensity";
import { simulationState, viewOf } from "@/lib/simulation/service";
import { CONCERNS } from "@/lib/skin/concerns";

/**
 * The living report: real scores and masks, wording and a plan built from this client's own scan,
 * answers and the clinic's menu (DECISIONS D-045). The Claude-written report layers on top in Week 2.
 */
export default async function ReportPage({ params }: PageProps<"/r/[token]">) {
  const { token } = await params;
  const { client, clinic, intake, latest, report } = await loadReport(token);
  const result = latest.result!;
  const stated = statedConcerns(intake);
  // The lowest score first, then what matters most once the client's own goals are weighed in.
  const top = rankPriorities(result, stated);
  const rest = result.concerns.filter((c) => !top.some((t) => t.key === c.key)).sort((a, b) => a.ui - b.ui);
  const now = await sandboxNow();
  const tz = clinic.timezone;
  const scanLabel = `Scan ${String(latest.scanNumber).padStart(2, "0")}`;
  const engineLabel = latest.source === "live" && result.engine === "hd" ? " · HD analysis" : "";

  const { plan, from } = (await reportPlan(token))!;
  // The note is written in the dashboard by the clinic's practitioner (brief 3.2).
  const practitioner = report.practitionerNote
    ? ((await getStore().listStaff(clinic.id)).find((s) => s.role === "practitioner") ?? null)
    : null;
  const hasPlan = plan.recommended.lines.length > 0;
  const asked = mentions(result, stated, top, plan);

  let event: { label: string; weeks: number } | null = null;
  if (intake?.hasEvent && intake.eventDate && intake.eventType) {
    const date = new Date(`${intake.eventDate}T12:00:00Z`);
    const type = EVENT_OPTIONS.find(([v]) => v === intake.eventType)?.[1] ?? "Event";
    const weeks = Math.max(0, Math.round((date.getTime() - now.getTime()) / (7 * 86_400_000)));
    const name = intake.eventType === "other" ? "Your event" : `Your ${type.toLowerCase()}`;
    event = { label: `${name} · ${formatLongDate(addDays(date, 0), "UTC").replace(/, \d{4}$/, "")}`, weeks };
  }

  return (
    <article className="pt-10 pb-4">
      <Label>
        {formatLongDate(latest.completedAt ?? latest.createdAt, tz)} · {scanLabel}
        {engineLabel}
      </Label>
      <h1 className="t-h1 mt-4 reveal">
        {client.firstName ? `${client.firstName}, your skin is telling a clear story.` : "Your skin is telling a clear story."}
      </h1>
      <p className="t-body mt-4">{subhead(result)}</p>

      {event && (
        <div className="mt-8 bg-mist px-4 py-3 flex justify-between items-center text-[14px] text-ink">
          <span>{event.label}</span>
          <span className="text-text-3">{event.weeks === 1 ? "1 week away" : `${event.weeks} weeks away`}</span>
        </div>
      )}

      {latest.source === "fixture" && (
        <p className="mt-6 border border-mist px-4 py-3 t-caption">
          <span className="text-ink">Demo analysis.</span> These results are sample data for this demo, not a reading of
          your photo.
        </p>
      )}

      <section className="mt-8" aria-label="Your face map">
        <FaceMap
          photoUrl={`/r/${token}/photo/${latest.id}`}
          caption={`${scanLabel} · Face map`}
          layers={top.map((c) => ({
            key: c.key,
            label: CONCERNS[c.key].label,
            describes: CONCERNS[c.key].describes,
            maskUrl: c.maskPath ? `/r/${token}/mask/${latest.id}/${c.key}` : null,
          }))}
        />
      </section>

      <section className="mt-16">
        <h2 className="t-h2">Your three priorities</h2>
        <p className="t-body mt-3">Scores run from 1 to 100. Higher means healthier-looking skin.</p>
        <ol className="mt-8">
          {top.map((c, i) => (
            <li key={c.key} className="border-t border-mist py-6">
              <p className="t-label">{String(i + 1).padStart(2, "0")}</p>
              <div className="flex items-end justify-between gap-4">
                <h3 className="t-h3 pb-2">{CONCERNS[c.key].label}</h3>
                <ScoreNumber value={c.ui} />
              </div>
              <ScoreBar value={c.ui} className="mt-3" />
              <p className="t-body mt-4">{priorityMeaning(i, c, top.slice(0, i), stated, plan)}</p>
            </li>
          ))}
        </ol>
        {asked.length > 0 && (
          <div className="mt-2 bg-mist px-4 py-4">
            <p className="t-label">What you asked about</p>
            {asked.map((m) => (
              <p key={m.phrase} className="t-body mt-2">
                {m.text}
              </p>
            ))}
          </div>
        )}
      </section>

      <details className="group mt-4 border border-mist">
        <summary className="min-h-12 flex items-center justify-center text-[14px] text-ink cursor-pointer list-none">
          Full analysis · {rest.length} more concerns
        </summary>
        <dl className="grid grid-cols-2 gap-x-6 px-4 pb-4">
          {rest.map((c) => (
            <div key={c.key} className="flex items-baseline justify-between border-t border-mist py-3">
              <dt className="text-[14px] text-text-2">{CONCERNS[c.key].label}</dt>
              <dd className="font-display text-[26px] font-light text-ink leading-none">{c.ui}</dd>
            </div>
          ))}
        </dl>
      </details>

      {report.practitionerNote && (
        <figure className="mt-16 bg-mist px-6 py-8">
          <figcaption className="t-label">Your practitioner&apos;s note</figcaption>
          <blockquote className="t-quote mt-4">{report.practitionerNote}</blockquote>
          {practitioner && (
            <p className="t-caption mt-4 !text-ink">
              {practitioner.name}, {practitioner.title}
            </p>
          )}
        </figure>
      )}

      {hasPlan ? (
        <>
          <PlanTimeline plan={plan} rationale={planRationale(plan)} clinic={clinic} intake={intake} />
          <WhatToExpect
            token={token}
            scanId={latest.id}
            // Demo readings never get a simulation: it would look like a prediction of real results.
            initial={latest.source === "live" ? viewOf(simulationState(report, latest.id)).status : "none"}
            week={illustratedWeek(plan, from)}
          />
          <Investment plan={plan} budgetBand={intake?.budgetBand ?? null} />
          <HomeCare plan={plan} />
          <ReadyWhenYouAre plan={plan} clinic={clinic} />
        </>
      ) : (
        <section className="mt-16 bg-ink on-dark px-6 py-10">
          <h2 className="font-display font-light text-[30px] leading-tight text-porcelain">What happens next.</h2>
          <p className="mt-3 text-[15px] leading-relaxed text-ink-soft">
            {clinic.name} reviews every scan and will suggest where to begin. Your plan will appear on this page. Same
            link, always private.
          </p>
        </section>
      )}

      <Hairline className="mt-16" />
      <p className="t-caption mt-6">
        This is a cosmetic assessment of visible skin, not a medical diagnosis. Scores come from AI skin analysis and are
        reviewed by your practitioner.
      </p>
      <div className="t-caption mt-2">
        Your photo is stored securely and never shared. <DeleteData token={token} />
      </div>
    </article>
  );
}
