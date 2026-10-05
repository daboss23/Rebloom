import { DeleteData } from "@/components/report/DeleteData";
import { FaceMap } from "@/components/report/FaceMap";
import { Hairline, Label, ScoreBar, ScoreNumber } from "@/components/ui/Typography";
import { addDays, formatLongDate } from "@/lib/clock";
import { EVENT_OPTIONS } from "@/lib/flow/intake-options";
import { loadReport } from "@/lib/report/load";
import { sandboxNow } from "@/lib/sandbox";
import { CONCERNS } from "@/lib/skin/concerns";
import { priorities } from "@/lib/skin/normalize";

/**
 * The living report, Week 1 version: real scores and masks, template copy.
 * Week 2 adds the Claude-written report, the plan, investment and booking.
 */
export default async function ReportPage({ params }: PageProps<"/r/[token]">) {
  const { token } = await params;
  const { client, clinic, intake, latest } = await loadReport(token);
  const result = latest.result!;
  const top = priorities(result, 3);
  const rest = result.concerns.filter((c) => !top.some((t) => t.key === c.key)).sort((a, b) => a.ui - b.ui);
  const now = await sandboxNow();
  const tz = clinic.timezone;
  const scanLabel = `Scan ${String(latest.scanNumber).padStart(2, "0")}`;

  let event: { label: string; weeks: number } | null = null;
  if (intake?.hasEvent && intake.eventDate && intake.eventType) {
    const date = new Date(`${intake.eventDate}T12:00:00Z`);
    const type = EVENT_OPTIONS.find(([v]) => v === intake.eventType)?.[1] ?? "Event";
    const weeks = Math.max(0, Math.round((date.getTime() - now.getTime()) / (7 * 86_400_000)));
    const name = intake.eventType === "other" ? "Your event" : `Your ${type.toLowerCase()}`;
    event = { label: `${name} · ${formatLongDate(addDays(date, 0), "UTC").replace(/, \d{4}$/, "")}`, weeks };
  }

  const meaning = (i: number, key: (typeof top)[number]["key"]) =>
    i === 0
      ? `Your biggest opportunity, and the area most likely to show visible change with treatment.`
      : CONCERNS[key].describes;

  return (
    <article className="pt-10 pb-4">
      <Label>
        {formatLongDate(latest.completedAt ?? latest.createdAt, tz)} · {scanLabel}
      </Label>
      <h1 className="t-h1 mt-4 reveal">
        {client.firstName ? `${client.firstName}, your skin is telling a clear story.` : "Your skin is telling a clear story."}
      </h1>
      <p className="t-body mt-4">Here&apos;s what we see, and where we&apos;d begin.</p>

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
              <p className="t-body mt-4">{meaning(i, c.key)}</p>
            </li>
          ))}
        </ol>
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

      <section className="mt-16 bg-ink on-dark px-6 py-10">
        <h2 className="font-display font-light text-[30px] leading-tight text-porcelain">What happens next.</h2>
        <p className="mt-3 text-[15px] leading-relaxed text-ink-soft">
          {clinic.name} reviews every scan. Your personal plan, with dates and prices from our menu, will appear on this
          page. Same link, always private.
        </p>
      </section>

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
