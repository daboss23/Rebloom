import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ConfirmPlan } from "@/components/dashboard/ConfirmPlan";
import { NoteEditor } from "@/components/dashboard/NoteEditor";
import { Portrait } from "@/components/dashboard/Portrait";
import { Queue } from "@/components/dashboard/Queue";
import { toQueueRow } from "@/components/dashboard/queue-row";
import { Sparkline } from "@/components/dashboard/Sparkline";
import { StatusMark } from "@/components/dashboard/StatusMark";
import { IconAlert, IconArrowLeft, IconArrowUpRight } from "@/components/ui/Icons";
import { cx } from "@/components/ui/cx";
import { briefFacts, lowestScores, suggestedPlan } from "@/lib/dashboard/brief";
import { loadBook } from "@/lib/dashboard/load";
import { monthDay, shortDay, shortName, statusOf } from "@/lib/dashboard/view";
import { env } from "@/lib/env";
import { formatPrice } from "@/lib/plan/build";
import { courses } from "@/lib/rebook/engine";
import { concernLabel } from "@/lib/skin/concerns";

export async function generateMetadata({ params }: PageProps<"/dashboard/clients/[id]">): Promise<Metadata> {
  const { id } = await params;
  const book = await loadBook();
  const facts = book.facts.find((f) => f.client.id === id);
  return { title: facts ? `${shortName(facts.client)} · Brief` : "Client" };
}

interface PlanLineView {
  key: string;
  name: string;
  detail: string;
  price: string;
}

export default async function BriefPage({ params }: PageProps<"/dashboard/clients/[id]">) {
  const { id } = await params;
  const book = await loadBook();
  const facts = book.facts.find((f) => f.client.id === id);
  if (!facts || !facts.client.firstName) notFound();

  const { client, intake, report } = facts;
  const tz = book.clinic.timezone;
  const local = (instant: string) => new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date(instant));
  const time = (instant: string) =>
    new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz }).format(new Date(instant)).replace(" ", "").toLowerCase();
  const item = book.queue.items.find((i) => i.clientId === client.id);
  const status = statusOf(facts, item);
  const latest = facts.scans[facts.scans.length - 1];
  const first = facts.scans[0];
  const next = facts.appointments.find((a) => a.status === "booked" && a.startsAt >= book.now.toISOString());
  const info = briefFacts(facts);
  const scores = lowestScores(facts);
  const name = client.firstName!;

  // ---------- The plan panel: the confirmed plan, or what the report suggests ----------
  const suggested = !facts.plan ? suggestedPlan(book, facts) : null;
  const treatmentName = (tid: string | null) => book.input.treatments.find((t) => t.id === tid)?.name ?? "Treatment";
  const productName = (pid: string | null) => book.input.products.find((p) => p.id === pid)?.name ?? "Product";
  let lines: PlanLineView[] = [];
  let total = 0;
  let planLabel = "Suggested plan";
  let planNote = "";
  if (facts.plan) {
    const progress = courses(facts, book.input.treatments);
    const homeCare = facts.plan.items.filter((i) => i.productId);
    lines = [
      ...facts.plan.items
        .filter((i) => i.treatmentId)
        .map((i) => {
          const course = progress.find((c) => c.item.id === i.id);
          return {
            key: i.id,
            name: `${treatmentName(i.treatmentId)} · ${i.quantity}`,
            detail: course ? `${course.done.length} of ${i.quantity} done${course.booked.length ? ` · ${course.booked.length} booked` : ""}` : "",
            price: formatPrice(i.quantity * i.unitPriceCents),
          };
        }),
      ...(homeCare.length
        ? [
            {
              key: "home",
              name: `Home care · ${homeCare.length} ${homeCare.length === 1 ? "product" : "products"}`,
              detail: homeCare.map((i) => productName(i.productId)).join(", "),
              price: formatPrice(homeCare.reduce((n, i) => n + i.quantity * i.unitPriceCents, 0)),
            },
          ]
        : []),
    ];
    total = facts.plan.totalCents;
    planLabel = facts.plan.status === "proposed" ? "Proposed plan" : facts.plan.status === "completed" ? "Completed plan" : "Confirmed plan";
    const by = facts.plan.confirmedAt ? `Confirmed ${monthDay(local(facts.plan.confirmedAt))}` : "Not confirmed yet";
    planNote = facts.plan.status === "proposed" ? "Proposed from the report. Confirm it with the client at their visit." : `${by}. Progress scans are scheduled automatically.`;
  } else if (suggested) {
    const { plan } = suggested;
    lines = [
      ...plan.recommended.lines.map((l) => ({
        key: l.treatment.id,
        name: `${l.treatment.name} · ${l.sessions}`,
        detail: l.covers.map((k) => concernLabel(k)).join(" and "),
        price: formatPrice(l.totalCents),
      })),
      ...(plan.homeCare.length
        ? [
            {
              key: "home",
              name: `Home care · ${plan.homeCare.length} ${plan.homeCare.length === 1 ? "product" : "products"}`,
              detail: plan.homeCare.map((h) => h.product.name).join(", "),
              price: formatPrice(plan.homeCare.reduce((n, h) => n + h.product.priceCents, 0)),
            },
          ]
        : []),
    ];
    total = plan.recommended.totalCents + plan.homeCare.reduce((n, h) => n + h.product.priceCents, 0);
    const fits = plan.budgetCapCents === null || plan.recommended.totalCents <= plan.budgetCapCents;
    planNote = [
      fits ? "Fits the budget they gave" : "Above the budget they gave; a lighter option is on their report",
      plan.shortenedForEvent ? "shortened to finish before their event" : null,
    ]
      .filter(Boolean)
      .join(", ")
      .concat(". Built only from the clinic's menu.");
  }

  const kicker = next
    ? `${next.kind === "consult" ? "Consult brief" : "Client brief"} · ${shortDay(local(next.startsAt))} · ${time(next.startsAt)}`
    : "Client brief · Nothing booked";
  const photo = report && latest ? `/r/${report.token}/photo/${latest.id}` : null;
  const initials = `${name[0]}${client.lastName?.[0] ?? ""}`;
  const pastVisits = facts.appointments.filter((a) => a.status !== "cancelled");

  return (
    <div>
      <Link href="/dashboard/clients" className="group inline-flex items-center gap-2 text-[13px] text-text-3 hover:text-ink">
        <IconArrowLeft width={15} height={15} className="transition-transform duration-200 group-hover:-translate-x-0.5" />
        All clients
      </Link>

      <header className="reveal mt-6 flex flex-wrap items-end justify-between gap-x-10 gap-y-6">
        <div className="min-w-0">
          <p className="t-label">{kicker}</p>
          <h1 className="mt-3 font-display text-[clamp(44px,6vw,64px)] font-light leading-[1] tracking-[-0.02em] text-ink">{shortName(client)}</h1>
          <p className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-[14.5px] text-text-2">
            <StatusMark status={status} />
            {info.age && <span className="text-text-3">· {info.age}</span>}
            {first && <span className="text-text-3">· First scan {monthDay(local(first.createdAt))}</span>}
            <span className="text-text-3">
              · {facts.scans.length} {facts.scans.length === 1 ? "scan" : "scans"}
            </span>
          </p>
        </div>
        {report && client.email && (
          <a
            href={`/r/${report.token}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-11 items-center gap-2 border border-ink px-5 text-[14px] text-ink transition-[background-color,color,transform] duration-200 ease-out hover:bg-ink hover:text-porcelain active:scale-[0.98]"
          >
            View client report
            <span className="sr-only">(opens in a new tab)</span>
            <IconArrowUpRight width={15} height={15} />
          </a>
        )}
      </header>

      {item && (
        <section aria-label="In the queue" className="mt-10">
          <Queue rows={[toQueueRow(item, facts)]} demo={env.DEMO_MODE} empty="" hideNames />
        </section>
      )}

      <div className="mt-12 grid gap-x-10 gap-y-12 md:grid-cols-2 xl:grid-cols-[minmax(0,20rem)_minmax(0,1fr)_minmax(0,23rem)]">
        {/* ---------- Face and scores ---------- */}
        <section aria-labelledby="scores" className="min-w-0">
          <Portrait src={photo} initials={initials} caption={latest ? `Scan ${String(latest.scanNumber).padStart(2, "0")} · ${monthDay(local(latest.createdAt))}` : "No scan yet"} />
          <h2 id="scores" className="t-label mt-8">
            Lowest scores
          </h2>
          <ul className="mt-2">
            {scores.map((s) => (
              <li key={s.score.key} className="grid grid-cols-[minmax(0,1fr)_auto_3.25rem] items-center gap-4 border-b border-mist py-3">
                <span className="text-[14.5px] text-ink">{s.label}</span>
                <span className="flex items-center gap-3">
                  {s.delta !== null && (
                    <span className={cx("text-[12px] tabular-nums", s.delta > 0 ? "text-glacier-deep" : "text-text-3")}>
                      {s.delta > 0 ? `+${s.delta}` : s.delta}
                    </span>
                  )}
                  <Sparkline values={s.series} width={56} height={18} />
                </span>
                <span className="text-right font-display text-[26px] font-light leading-none text-ink tabular-nums">{s.score.ui}</span>
              </li>
            ))}
          </ul>
          {info.skinAge !== null && (
            <p className="t-caption mt-4 !text-[12.5px]">
              Skin age reads {info.skinAge}. For you only, never shown to the client.
            </p>
          )}
        </section>

        {/* ---------- Their words, facts, flags, note ---------- */}
        <section aria-label="About the client" className="min-w-0">
          {intake?.goalText && (
            <figure>
              <figcaption className="t-label">In {name}&apos;s words</figcaption>
              <blockquote className="mt-4 font-display text-[clamp(24px,2.4vw,30px)] font-light leading-snug text-ink">
                &ldquo;{intake.goalText}&rdquo;
              </blockquote>
            </figure>
          )}
          <dl className={cx("grid grid-cols-2 gap-x-6", intake?.goalText && "mt-8")}>
            {[
              ["Event", info.event ?? "None given"],
              ["Budget", info.budget ?? "Not given"],
              ["Past treatments", info.pastTreatments],
              ["Skin type", info.skinType ?? "Unknown"],
            ].map(([term, value]) => (
              <div key={term} className="border-t border-mist py-4">
                <dt className="t-label !text-[10.5px]">{term}</dt>
                <dd className="mt-1.5 text-[15px] text-ink">{value}</dd>
              </div>
            ))}
          </dl>

          {info.flags.length > 0 && (
            <div className="mt-4 border border-glacier-deep/40 p-5">
              <p className="flex items-center gap-2.5 text-[14.5px] text-ink">
                <IconAlert width={17} height={17} className="text-glacier-deep" />
                Review before treatment
              </p>
              <ul className="mt-3 space-y-2.5">
                {info.flags.map((flag) => (
                  <li key={flag} className="text-[14px] leading-relaxed text-text-2">
                    {flag}
                  </li>
                ))}
              </ul>
              <p className="t-caption mt-4 !text-[12px]">Flags are prompts for your judgement, not decisions.</p>
            </div>
          )}

          {report && (
            <div className="mt-10">
              <NoteEditor clientId={client.id} initial={report.practitionerNote} author={`${book.staff.name}, ${book.staff.title}`} />
            </div>
          )}

          <h2 className="t-label mt-12">Visits</h2>
          {pastVisits.length === 0 ? (
            <p className="t-caption mt-3 border-t border-mist pt-4">No visits yet.</p>
          ) : (
            <ol className="mt-2">
              {pastVisits.map((a) => (
                <li key={a.id} className="grid grid-cols-[6.5rem_minmax(0,1fr)_auto] items-baseline gap-4 border-b border-mist py-3 text-[14px]">
                  <span className={cx("tabular-nums", a.status === "booked" ? "text-ink" : "text-text-3")}>{shortDay(local(a.startsAt))}</span>
                  <span className="truncate text-text-2">{a.treatmentId ? treatmentName(a.treatmentId) : "First consultation"}</span>
                  <span className="t-caption !text-[12px]">{a.status === "booked" ? `Booked · ${time(a.startsAt)}` : a.status === "completed" ? "Done" : "Missed"}</span>
                </li>
              ))}
            </ol>
          )}
        </section>

        {/* ---------- The plan ---------- */}
        <section aria-labelledby="plan" className="on-dark md:col-span-2 xl:col-span-1 self-start bg-ink p-7 text-porcelain sm:p-8">
          <h2 id="plan" className="t-label !text-ink-soft">
            {planLabel}
          </h2>
          {lines.length === 0 ? (
            <p className="mt-5 text-[15px] text-ink-soft">No plan yet. One appears here once {name} has a scan.</p>
          ) : (
            <>
              <ul className="mt-4">
                {lines.map((line) => (
                  <li key={line.key} className="flex items-start justify-between gap-6 border-b border-white/12 py-4">
                    <span className="min-w-0">
                      <span className="block text-[15.5px] text-porcelain">{line.name}</span>
                      {line.detail && <span className="mt-1 block text-[13px] text-ink-soft">{line.detail}</span>}
                    </span>
                    <span className="text-[15px] tabular-nums text-porcelain">{line.price}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-8 flex items-baseline justify-between gap-6">
                <span className="text-[14px] text-ink-soft">Plan value</span>
                <span className="font-display text-[44px] font-light leading-none tabular-nums text-porcelain">{formatPrice(total)}</span>
              </div>
              <p className="mt-5 text-[13px] leading-relaxed text-ink-soft">{planNote}</p>
              {(!facts.plan || facts.plan.status === "proposed") && (
                <div className="mt-7">
                  <ConfirmPlan clientId={client.id} />
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
