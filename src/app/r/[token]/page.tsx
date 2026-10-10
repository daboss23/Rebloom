import { Bloom } from "@/components/dashboard/Bloom";
import { LightField } from "@/components/dashboard/LightField";
import { ClinicSide } from "@/components/flow/ClinicSide";
import { DeleteData } from "@/components/report/DeleteData";
import { FaceMap, FaceMapFocus, FaceMapPriority } from "@/components/report/FaceMap";
import { BookingLine, HomeCare, Investment, PlanTimeline, ReadyWhenYouAre } from "@/components/report/PlanSections";
import { RescanInvite, ScanPair, WhatsChanged } from "@/components/report/ProgressSections";
import { WhatToExpect } from "@/components/report/WhatToExpect";
import { IconPlus } from "@/components/ui/Icons";
import { ScoreNumber } from "@/components/ui/Typography";
import { ScoreRuler } from "@/components/ui/ScoreRuler";
import { addDays, formatLongDate } from "@/lib/clock";
import { clinicSideLink } from "@/lib/dashboard/handoff";
import { EVENT_OPTIONS } from "@/lib/flow/intake-options";
import { rankPriorities, statedConcerns } from "@/lib/plan/build";
import { bookingSummary } from "@/lib/booking/summary";
import { loadReport, reportPlan } from "@/lib/report/load";
import { mentions, planRationale, priorityMeaning, subhead } from "@/lib/report/personal";
import { buildProgress, progressSubhead } from "@/lib/report/progress";
import { sandboxNow } from "@/lib/sandbox";
import { getStore } from "@/lib/store";
import { illustratedWeek } from "@/lib/simulation/intensity";
import { simulationState, viewOf } from "@/lib/simulation/service";
import { CONCERNS } from "@/lib/skin/concerns";
import { concernAnchor } from "@/lib/skin/fixture-masks";
import { demoFace } from "@/lib/demo/landmarks";

/**
 * The living report: real scores and masks, wording and a plan built from this client's own scan,
 * answers and the clinic's menu (DECISIONS D-045). Claude reads their own words; code writes every sentence (D-079).
 */
export default async function ReportPage({ params }: PageProps<"/r/[token]">) {
  const { token } = await params;
  const { client, clinic, intake, latest, report, scans } = await loadReport(token);
  const result = latest.result!;
  const stated = statedConcerns(intake);
  // The lowest score first, then what matters most once the client's own goals are weighed in. Chosen from the
  // first scan, so a rescan measures the same three priorities (as the rebook engine does).
  const keys = rankPriorities(scans[0].result!, stated).map((c) => c.key);
  const top = keys.map((k) => result.concerns.find((c) => c.key === k)!).filter(Boolean);
  // From the second scan on, the same link leads with what's changed (brief 3.1 step 10, D-073).
  const progress = buildProgress(scans, keys);
  // The face model's points on the latest photo, for the face map's reveal (D-074). Demo portraits' come with the app.
  const face = latest.landmarks ?? (client.demoKey ? demoFace(client.demoKey) : null);
  const facePoints = face?.slice(0, 468).map(([x, y]) => [Math.round(x * 1000) / 1000, Math.round(y * 1000) / 1000] as [number, number]) ?? null;
  const rest = result.concerns.filter((c) => !top.some((t) => t.key === c.key)).sort((a, b) => a.ui - b.ui);
  const now = await sandboxNow();
  const tz = clinic.timezone;
  const scanLabel = `Scan ${String(latest.scanNumber).padStart(2, "0")}`;
  const weekLabel = progress && progress.weeks > 0 ? ` · Week ${progress.weeks}` : "";
  // A client a fortnight past their first scan can check their progress. Demo clients' portraits can't be rescanned.
  const canRescan =
    !client.demoKey &&
    (progress !== null || now.getTime() - Date.parse(latest.completedAt ?? latest.createdAt) >= 14 * 86_400_000);
  const engineLabel = latest.source === "live" && result.engine === "hd" ? " · HD analysis" : "";

  const { plan, from } = (await reportPlan(token))!;
  // The note is written in the dashboard by the clinic's practitioner (brief 3.2).
  const practitioner = report.practitionerNote
    ? ((await getStore().listStaff(clinic.id)).find((s) => s.role === "practitioner") ?? null)
    : null;
  const hasPlan = plan.recommended.lines.length > 0;
  const booking = await bookingSummary(token);
  const asked = mentions(result, stated, top, plan);
  // Demo only: someone who scanned themselves can open it as the clinic sees it, on any device (D-090).
  const clinicSide = clinicSideLink("", client);

  let event: { name: string; date: string; weeks: number } | null = null;
  if (intake?.hasEvent && intake.eventDate && intake.eventType) {
    const date = new Date(`${intake.eventDate}T12:00:00Z`);
    const type = EVENT_OPTIONS.find(([v]) => v === intake.eventType)?.[1] ?? "Event";
    const weeks = Math.max(0, Math.round((date.getTime() - now.getTime()) / (7 * 86_400_000)));
    const name = intake.eventType === "other" ? "Your event" : `Your ${type.toLowerCase()}`;
    event = { name, date: formatLongDate(addDays(date, 0), "UTC").replace(/, \d{4}$/, ""), weeks };
  }

  return (
    <article className="pb-4 pt-10">
      <p className="focus-in flex items-center gap-3 text-[0.75rem] uppercase tracking-[0.22em] text-[#1e5a78]">
        <span aria-hidden className="block h-[2px] w-8 rounded-full bg-accent" />
        {formatLongDate(latest.completedAt ?? latest.createdAt, tz)} · {scanLabel}
        {weekLabel}
        {engineLabel}
      </p>
      <h1 className="t-h1 focus-in mt-5 [text-wrap:balance]" style={{ animationDelay: "80ms" }}>
        {progress
          ? progress.moved
            ? `${client.firstName ? `${client.firstName}, your` : "Your"} skin has moved.`
            : `${client.firstName ? `${client.firstName}, here's` : "Here's"} your progress.`
          : client.firstName
            ? `${client.firstName}, your skin is telling a clear story.`
            : "Your skin is telling a clear story."}
      </h1>
      <p className="focus-in mt-5 text-[1.03125rem] leading-relaxed text-text-2" style={{ animationDelay: "140ms" }}>
        {progress ? progressSubhead(progress) : subhead(result)}
      </p>

      {event && (
        <div
          className="glass focus-in mt-7 flex items-center justify-between gap-4 px-5 py-4"
          style={{ animationDelay: "200ms" }}
        >
          <span className="flex items-center gap-3">
            <Bloom size={20} unfurl className="shrink-0 text-[#9e4a5d]" />
            <span>
              <span className="block text-[0.9375rem] leading-snug text-ink">{event.name}</span>
              <span className="t-caption block">{event.date}</span>
            </span>
          </span>
          <span className="whitespace-nowrap text-[0.875rem] text-[#1e5a78]">
            {event.weeks === 1 ? "1 week away" : `${event.weeks} weeks away`}
          </span>
        </div>
      )}

      <BookingLine booking={booking} />

      {latest.source === "fixture" && (
        <p className="t-caption mt-5 rounded-[14px] bg-white/55 px-4 py-3 ring-1 ring-inset ring-[#0c1a22]/[0.07]">
          <span className="text-ink">Demo analysis.</span> These results are sample data for this demo, not a reading of
          your photo.
        </p>
      )}

      {progress && (
        <>
          <ScanPair token={token} progress={progress} tz={tz} />
          <WhatsChanged items={progress.items} />
          {canRescan && <RescanInvite token={token} again />}
        </>
      )}

      {/* Choosing a priority on the photo outlines its card below. */}
      <FaceMapFocus initial={top[0]?.key ?? null}>
        <section
          className={progress ? "mt-16" : "focus-in mt-8"}
          style={progress ? undefined : { animationDelay: "240ms" }}
          aria-label="Your face map"
        >
          {progress && <h2 className="t-h2 mb-6">Your latest scan, mapped</h2>}
          <FaceMap
            photoUrl={`/r/${token}/photo/${latest.id}`}
            initials={`${client.firstName?.[0] ?? ""}${client.lastName?.[0] ?? ""}`}
            caption={`${scanLabel} · Face map`}
            layers={top.map((c) => ({
              key: c.key,
              label: CONCERNS[c.key].label,
              describes: CONCERNS[c.key].describes,
              score: Math.round(c.ui),
              anchor: face ? concernAnchor(face, c.key) : null,
            }))}
            landmarks={facePoints}
          />
        </section>

        {/* From the second scan on, What's changed above holds the three priorities. */}
        {!progress && (
          <section className="mt-16">
            <h2 className="t-h2">Your three priorities</h2>
            <p className="t-body mt-3">Scores run from 1 to 100. Higher means healthier-looking skin.</p>
            <ol className="mt-7 space-y-3">
              {top.map((c, i) => (
                <FaceMapPriority key={c.key} concern={c.key} className="glass px-5 py-5">
                  <div className="flex items-end justify-between gap-4">
                    <div>
                      <p className="t-label">{String(i + 1).padStart(2, "0")}</p>
                      <h3 className="mt-1 font-display text-[1.625rem] font-light leading-tight text-ink">
                        {CONCERNS[c.key].label}
                      </h3>
                    </div>
                    <ScoreNumber value={c.ui} />
                  </div>
                  <ScoreRuler value={c.ui} className="mt-4" />
                  <p className="t-body mt-4">{priorityMeaning(i, c, top.slice(0, i), stated, plan, result.concerns)}</p>
                </FaceMapPriority>
              ))}
            </ol>
            {asked.length > 0 && (
              <div className="mt-3 rounded-[18px] bg-[radial-gradient(120%_90%_at_100%_0%,rgba(255,214,196,0.55)_0%,rgba(255,214,196,0)_60%),linear-gradient(180deg,rgba(255,255,255,0.75),rgba(255,255,255,0.55))] px-5 py-5 ring-1 ring-white/80">
                <p className="t-label">What you asked about</p>
                {asked.map((m) => (
                  <p key={m.phrase} className="t-body mt-2">
                    {m.text}
                  </p>
                ))}
              </div>
            )}
            {canRescan && <RescanInvite token={token} again={false} />}
          </section>
        )}
      </FaceMapFocus>

      <details className="glass group mt-3 overflow-hidden">
        <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 px-5 text-[0.9375rem] text-ink [&::-webkit-details-marker]:hidden">
          <span>
            Full analysis <span className="text-text-3">· {rest.length} more concerns</span>
          </span>
          <IconPlus
            aria-hidden
            width={18}
            height={18}
            className="shrink-0 text-text-3 transition-transform duration-300 ease-out group-open:rotate-45"
          />
        </summary>
        <dl className="grid grid-cols-2 gap-x-6 px-5 pb-3">
          {rest.map((c) => (
            <div key={c.key} className="flex items-baseline justify-between border-t border-[#0c1a22]/[0.07] py-3">
              <dt className="text-[0.875rem] text-text-2">{CONCERNS[c.key].label}</dt>
              <dd className="font-display text-[1.625rem] font-light leading-none text-ink">{c.ui}</dd>
            </div>
          ))}
        </dl>
      </details>

      {report.practitionerNote && (
        <figure className="relative mt-16 overflow-hidden rounded-[24px] bg-[radial-gradient(110%_80%_at_100%_0%,rgba(255,214,196,0.6)_0%,rgba(255,214,196,0)_58%),linear-gradient(180deg,#f9fcfd_0%,#e7f1f6_100%)] px-6 py-8 shadow-[inset_0_1px_0_rgba(255,255,255,0.95),0_22px_44px_-26px_rgba(12,44,62,0.32)] ring-1 ring-white/80">
          <figcaption className="t-label">Your practitioner&apos;s note</figcaption>
          <blockquote className="mt-4 font-display text-[1.5625rem] font-light leading-[1.3] text-ink">
            {report.practitionerNote}
          </blockquote>
          {practitioner && (
            <p className="mt-6 flex items-center gap-3 text-[0.875rem] text-ink">
              <span
                aria-hidden
                className="grid h-10 w-10 place-items-center rounded-full bg-[linear-gradient(140deg,#ffe4d8,#f4b9a3_45%,#8fbfd6)] font-display text-[1.125rem] text-white [text-shadow:0_1px_2px_rgba(125,52,71,0.35)]"
              >
                {practitioner.name[0]}
              </span>
              <span>
                {practitioner.name}
                <span className="block text-[0.8125rem] text-text-3">{practitioner.title}</span>
              </span>
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
          <ReadyWhenYouAre plan={plan} clinic={clinic} booking={booking} />
        </>
      ) : (
        <section className="sea on-dark relative mt-16 overflow-hidden rounded-[28px] px-6 py-10 shadow-[0_40px_80px_-44px_rgba(12,26,34,0.65)]">
          <LightField variant="sea" className="opacity-60" />
          <div className="relative">
            <h2 className="font-display text-[2rem] font-light leading-tight text-white">What happens next.</h2>
            <p className="mt-3 text-[0.9375rem] leading-relaxed text-[#dbe8ef]">
              {clinic.name} reviews every scan and will suggest where to begin. Your plan will appear on this page. Same
              link, always private.
            </p>
          </div>
        </section>
      )}

      {clinicSide && <ClinicSide href={clinicSide} clinicName={clinic.name} className="mt-16" />}

      <div className="mt-16 border-t border-[#0c1a22]/[0.08] pt-6">
        <p className="t-caption">
          This is a cosmetic assessment of visible skin, not a medical diagnosis. Scores come from AI skin analysis and
          are reviewed by your practitioner.
        </p>
        <div className="t-caption mt-2">
          Your photo is stored securely and never shared. <DeleteData token={token} />
        </div>
      </div>
    </article>
  );
}
