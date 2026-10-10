import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ConfirmPlan } from "@/components/dashboard/ConfirmPlan";
import { Conversation, type ConversationEntry } from "@/components/dashboard/Conversation";
import { NoteEditor } from "@/components/dashboard/NoteEditor";
import { LightField } from "@/components/dashboard/LightField";
import { Portrait } from "@/components/dashboard/Portrait";
import { Queue } from "@/components/dashboard/Queue";
import { toQueueRow } from "@/components/dashboard/queue-row";
import { Sparkline } from "@/components/dashboard/Sparkline";
import { StatusMark } from "@/components/dashboard/StatusMark";
import { StopEmails } from "@/components/dashboard/StopEmails";
import { IconAlert, IconArrowLeft, IconArrowUpRight } from "@/components/ui/Icons";
import { cx } from "@/components/ui/cx";
import { briefFacts, lowestScores, suggestedPlan } from "@/lib/dashboard/brief";
import { loadBook } from "@/lib/dashboard/load";
import { monthDay, shortDay, shortName, statusOf } from "@/lib/dashboard/view";
import { env, features } from "@/lib/env";
import { currentReading } from "@/lib/intake/goal-reading";
import { formatPrice } from "@/lib/plan/build";
import { TRIGGER_ORDER, courses, daysBetween } from "@/lib/rebook/engine";
import { canWriteByEmail } from "@/lib/email/opt-out";
import { canAnswerByText, optedOutOfTexts, replySubject, thread, threadSubject } from "@/lib/replies/thread";
import { formatUsPhone, toUsE164 } from "@/lib/sms/text";
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
  // What Claude understood from their own words, which the report answers (D-079).
  const read = intake ? currentReading(intake) : null;
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
  // Measured against the budget they gave, shown as a chip on the plan; null when they gave none.
  let budgetFit: "fits" | "over" | null = null;
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
    budgetFit = plan.budgetCapCents === null ? null : fits ? "fits" : "over";
    planNote = [fits ? null : "A lighter option is on their report", plan.shortenedForEvent ? "Shortened to finish before their event" : null, "Built only from the clinic's menu"]
      .filter(Boolean)
      .join(". ")
      .concat(".");
  }

  const kicker = next
    ? `${next.kind === "consult" ? "Consult brief" : "Client brief"} · ${shortDay(local(next.startsAt))} · ${time(next.startsAt)}`
    : "Client brief · Nothing booked";
  const photo = report && latest ? `/r/${report.token}/photo/${latest.id}` : null;
  const initials = `${name[0]}${client.lastName?.[0] ?? ""}`;
  const pastVisits = facts.appointments.filter((a) => a.status !== "cancelled");

  // ---------- The conversation (D-081) ----------
  const stamp = (instant: string) =>
    `${new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: tz }).format(new Date(instant))} · ${time(instant)}`;
  const waitedFor = (instant: string) => {
    const days = daysBetween(local(instant), book.today);
    return days <= 0 ? "today" : days === 1 ? "since yesterday" : `${days} days`;
  };
  const rebookTypes = new Set<string>(TRIGGER_ORDER);
  const entries: ConversationEntry[] = thread(facts.messages, client).map((e) => ({
    ...e,
    when: stamp(e.at),
    waiting: facts.reply?.id === e.id ? waitedFor(e.at) : null,
    // Sent for real unless it's a sample client's, or a rebook message sent in demo mode (D-085).
    logged: e.side === "clinic" && (client.isDemo || (env.DEMO_MODE && rebookTypes.has(facts.messages.find((m) => m.id === e.id)?.type ?? ""))),
  }));
  const mobile = toUsE164(client.phone);
  const channels = {
    // After an unsubscribe, email only to answer something they wrote since (D-086).
    email: canWriteByEmail({ email: client.email, unsubscribedAt: facts.unsubscribedAt, messages: facts.messages }),
    text: canAnswerByText({ phone: client.phone, canText: facts.canText, messages: facts.messages }),
  };
  // How the clinic may reach them, beside the other facts.
  const emails = !client.email
    ? "No address"
    : facts.unsubscribedAt
      ? `Unsubscribed ${monthDay(local(facts.unsubscribedAt))}`
      : facts.canEmail
        ? "Reminders on"
        : "No consent";
  const texts = !mobile ? "No mobile" : optedOutOfTexts(facts.messages) ? "Replied STOP" : facts.canText ? "Reminders on" : "No consent";
  const conversation = (
    <section
      id="conversation"
      aria-labelledby="conversation-title"
      className={cx("glass focus-in scroll-mt-8 p-6 sm:p-8", facts.reply ? "order-first mt-10" : "order-last mt-12")}
      style={{ animationDelay: facts.reply ? "60ms" : "300ms" }}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <h2 id="conversation-title" className="font-display text-[2.125rem] font-light leading-none text-ink">
          {facts.reply ? `${name} wrote back` : "Conversation"}
        </h2>
        <p className="t-caption !text-[0.8125rem]">Their replies to the clinic&apos;s emails and texts land here.</p>
      </div>
      <div className="mx-auto max-w-[46rem]">
        <Conversation
          clientId={client.id}
          firstName={name}
          entries={entries}
          channels={channels}
          defaultChannel={channels.text && (facts.reply?.channel === "sms" || !channels.email) ? "text" : "email"}
          email={client.email}
          unsubscribed={Boolean(facts.unsubscribedAt)}
          phone={mobile ? formatUsPhone(mobile) : client.phone}
          subject={replySubject(facts.reply?.channel === "email" ? facts.reply.subject : threadSubject(facts.messages), `A note from ${book.clinic.name}`)}
          waiting={Boolean(facts.reply)}
          demo={env.DEMO_MODE && client.isDemo}
        />
      </div>
    </section>
  );

  return (
    <div>
      <Link href="/dashboard/clients" className="group inline-flex items-center gap-2 text-[0.8125rem] text-text-3 hover:text-ink">
        <IconArrowLeft width={15} height={15} className="transition-transform duration-200 group-hover:-translate-x-0.5" />
        All clients
      </Link>

      <header className="focus-in mt-6 flex flex-wrap items-end justify-between gap-x-10 gap-y-6">
        <div className="min-w-0">
          <p className="text-[0.75rem] uppercase tracking-[0.22em] text-[#1e5a78]">{kicker}</p>
          <h1 className="mt-3 font-display text-[clamp(52px,7vw,88px)] font-light leading-[0.95] tracking-[-0.025em] text-ink">{shortName(client)}</h1>
          <p className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.9375rem] text-text-2">
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
            className="btn-ghost"
          >
            View client report
            <span className="sr-only">(opens in a new tab)</span>
            <IconArrowUpRight width={15} height={15} />
          </a>
        )}
      </header>

      {/* Mounted even when nothing is queued, so handling the row keeps its toast and Undo on screen. */}
      <section aria-label={item ? "In the queue" : undefined} className={item ? "mt-10" : undefined}>
        <Queue rows={item ? [toQueueRow(item, facts, book.clinic.name)] : []} demo={env.DEMO_MODE} realCopy={env.DEMO_MODE && features.email} empty="" onBrief />
      </section>

      {/* A reply waiting on Dana comes first; otherwise the conversation follows the brief. Moved by order, not
          by place in the tree, so answering it keeps the composer and its Undo where they are. */}
      <div className="flex flex-col">
      {conversation}

      <div className="mt-12 grid gap-x-10 gap-y-12 md:grid-cols-2 2xl:grid-cols-[minmax(0,320px)_minmax(0,1fr)_minmax(0,368px)]">
        {/* ---------- Face and scores ---------- */}
        <section aria-labelledby="scores" className="glass focus-in min-w-0 self-start p-4" style={{ animationDelay: "80ms" }}>
          <Portrait src={photo} initials={initials} caption={latest ? `Scan ${String(latest.scanNumber).padStart(2, "0")} · ${monthDay(local(latest.createdAt))}` : "No scan yet"} />
          <h2 id="scores" className="t-label mt-6 px-2">
            Lowest scores
          </h2>
          <ul className="mt-1 px-2">
            {scores.map((s, i) => (
              <li key={s.score.key} className="grid grid-cols-[minmax(0,1fr)_auto_52px] items-center gap-4 border-b border-[#0c1a22]/[0.06] py-3 last:border-0">
                <span className="min-w-0">
                  <span className="block text-[0.9375rem] text-ink">{s.label}</span>
                  <span aria-hidden className={cx("meter mt-2 block", s.delta !== null && s.delta > 0 && "meter-growth")}>
                    <span style={{ width: `${Math.max(0, Math.min(100, s.score.ui))}%`, animationDelay: `${320 + i * 70}ms` }} />
                  </span>
                </span>
                <span className="flex items-center gap-3">
                  {s.delta !== null && (
                    <span className={cx("text-[0.8125rem] tabular-nums", s.delta > 0 ? "font-medium text-[color:var(--growth)]" : "text-text-3")}>
                      {s.delta > 0 ? `+${s.delta}` : s.delta}
                    </span>
                  )}
                  {s.series.length > 1 && <Sparkline values={s.series} width={56} height={18} />}
                </span>
                <span className="text-right font-display text-[1.625rem] font-light leading-none text-ink tabular-nums">{s.score.ui}</span>
              </li>
            ))}
          </ul>
          {info.skinAge !== null && (
            <p className="t-caption mt-3 px-2 pb-2 !text-[0.8125rem]">
              Skin age reads {info.skinAge}. For you only, never shown to the client.
            </p>
          )}
        </section>

        {/* ---------- Their words, facts, flags, note ---------- */}
        <section aria-label="About the client" className="glass focus-in min-w-0 self-start p-6 sm:p-8" style={{ animationDelay: "160ms" }}>
          {intake?.goalText && (
            <figure>
              <figcaption className="t-label">In {name}&apos;s words</figcaption>
              <blockquote className="relative mt-3 pt-9 font-display text-[clamp(26px,2.6vw,34px)] font-light leading-snug text-ink">
                <span aria-hidden className="gold-foil absolute -left-0.5 top-0 font-display text-[4rem] leading-[0.8]">
                  &ldquo;
                </span>
                <span className="relative">{intake.goalText}</span>
              </blockquote>
              {read && read.length > 0 && (
                <p className="t-caption mt-4">Read as {read.map((r) => concernLabel(r.key).toLowerCase()).join(", ")}.</p>
              )}
            </figure>
          )}
          <dl className={cx("grid grid-cols-2 gap-x-6", intake?.goalText && "mt-8")}>
            {[
              ["Event", info.event ?? "None given"],
              ["Budget", info.budget ?? "Not given"],
              ["Past treatments", info.pastTreatments],
              ["Skin type", info.skinType ?? "Unknown"],
              ["Emails", emails],
              ["Texts", texts],
            ].map(([term, value]) => (
              <div key={term} className="border-t border-[#0c1a22]/[0.07] py-4">
                <dt className="t-label !text-[0.75rem]">{term}</dt>
                <dd className={cx("mt-1.5 text-[0.9375rem]", term === "Budget" && info.budget ? "font-medium text-[color:var(--gold)]" : "text-ink")}>
                  {value}
                  {term === "Emails" && facts.canEmail && <StopEmails clientId={client.id} firstName={name} />}
                </dd>
              </div>
            ))}
          </dl>

          {info.flags.length > 0 && (
            <div className="caution mt-4 p-5 sm:p-6">
              <p className="flex items-center gap-3">
                <span className="caution-badge">
                  <IconAlert width={17} height={17} />
                </span>
                <span className="font-display text-[1.375rem] leading-tight text-ink">Review before treatment</span>
                <span className="ml-auto rounded-full bg-white/80 px-2.5 py-0.5 text-[0.75rem] font-medium tabular-nums text-[#8a4b12] ring-1 ring-inset ring-[#e98c3c]/30">
                  {info.flags.length}
                </span>
              </p>
              <ul className="mt-4">
                {info.flags.map((flag) => (
                  <li key={flag} className="flex gap-3 border-t border-[#b8691f]/15 py-3 text-[0.875rem] leading-relaxed text-ink">
                    <span aria-hidden className="mt-[0.55em] h-1.5 w-1.5 shrink-0 rounded-full bg-[#e07a2a]" />
                    {flag}
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-[0.8125rem] text-[#7a4a1c]">Flags are prompts for your judgement, not decisions.</p>
            </div>
          )}

          {report && (
            <div className="mt-10">
              <NoteEditor clientId={client.id} initial={report.practitionerNote} author={`${book.staff.name}, ${book.staff.title}`} />
            </div>
          )}

          <h2 className="t-label mt-12">Visits</h2>
          {pastVisits.length === 0 ? (
            <p className="t-caption mt-3 pt-2">No visits yet.</p>
          ) : (
            <ol className="mt-2">
              {pastVisits.map((a) => (
                <li key={a.id} className="grid grid-cols-[104px_minmax(0,1fr)_auto] items-baseline gap-4 border-b border-[#0c1a22]/[0.06] py-3 text-[0.875rem] last:border-0">
                  <span className={cx("tabular-nums", a.status === "booked" ? "text-ink" : "text-text-3")}>{shortDay(local(a.startsAt))}</span>
                  <span className="truncate text-text-2">{a.treatmentId ? treatmentName(a.treatmentId) : "First consultation"}</span>
                  <span className="t-caption !text-[0.8125rem]">{a.status === "booked" ? `Booked · ${time(a.startsAt)}` : a.status === "completed" ? "Done" : "Missed"}</span>
                </li>
              ))}
            </ol>
          )}
        </section>

        {/* ---------- The plan ---------- */}
        <section
          aria-labelledby="plan"
          className="sea on-dark focus-in relative overflow-hidden rounded-[22px] p-7 shadow-[0_40px_80px_-40px_rgba(12,26,34,0.7)] md:col-span-2 2xl:col-span-1 self-start sm:p-8"
          style={{ animationDelay: "240ms" }}
        >
          <LightField variant="sea" className="opacity-45" />
          <div className="relative">
          <h2 id="plan" className="text-[0.75rem] uppercase tracking-[0.22em] text-[#e2c07a]">
            {planLabel}
          </h2>
          {lines.length === 0 ? (
            <p className="mt-5 text-[0.9375rem] text-ink-soft">No plan yet. One appears here once {name} has a scan.</p>
          ) : (
            <>
              <ul className="mt-4">
                {lines.map((line) => (
                  <li key={line.key} className="flex items-start justify-between gap-6 border-b border-white/10 py-4">
                    <span className="min-w-0">
                      <span className="block text-[0.96875rem] text-porcelain">{line.name}</span>
                      {line.detail && <span className="mt-1 block text-[0.8125rem] text-ink-soft">{line.detail}</span>}
                    </span>
                    <span className="font-display text-[1.5rem] font-light leading-none tabular-nums text-porcelain">{line.price}</span>
                  </li>
                ))}
              </ul>
              <div aria-hidden className="gold-rule mt-6" />
              <div className="mt-6 flex items-end justify-between gap-6">
                <span className="pb-2 text-[0.875rem] text-ink-soft">Plan value</span>
                <span className="gold-foil font-display text-[4.25rem] font-light leading-[0.9] tracking-[-0.02em]">{formatPrice(total)}</span>
              </div>
              {budgetFit && (
                <p
                  className={cx(
                    "mt-5 inline-flex items-center gap-2 rounded-full px-3 py-1 text-[0.8125rem] font-medium",
                    budgetFit === "fits" ? "bg-[#1f7a63]/25 text-[#a8ecd2] ring-1 ring-inset ring-[#7fd1b4]/40" : "bg-[#f49543]/20 text-[#ffd2a8] ring-1 ring-inset ring-[#f49543]/45",
                  )}
                >
                  <span aria-hidden className={cx("h-1.5 w-1.5 rounded-full", budgetFit === "fits" ? "bg-[#7fd1b4]" : "bg-[#f49543]")} />
                  {budgetFit === "fits" ? "Fits their budget" : "Above their budget"}
                </p>
              )}
              <p className="mt-4 text-[0.8125rem] leading-relaxed text-ink-soft">{planNote}</p>
              {(!facts.plan || facts.plan.status === "proposed") && (
                <div className="mt-7">
                  <ConfirmPlan clientId={client.id} />
                </div>
              )}
            </>
          )}
          </div>
        </section>
      </div>

      </div>
    </div>
  );
}
