import type { Metadata } from "next";
import Link from "next/link";
import { KindMarkStatic } from "@/components/dashboard/KindMarkStatic";
import { Queue } from "@/components/dashboard/Queue";
import { toQueueRow } from "@/components/dashboard/queue-row";
import { cx } from "@/components/ui/cx";
import { loadBook } from "@/lib/dashboard/load";
import { fullName, relativeDay } from "@/lib/dashboard/view";
import { env } from "@/lib/env";
import { formatPrice } from "@/lib/plan/build";
import { TRIGGER_LABEL, TRIGGER_ORDER, type QueueAction, type TriggerKind } from "@/lib/rebook/engine";
import {
  LAPSED_AFTER_DAYS,
  MISSED_AFTER_DAYS,
  PROGRESS_MOMENT_FRESH_DAYS,
  PROGRESS_MOMENT_RAW_DELTA,
  PROGRESS_SCAN_AFTER_DAYS,
  REPORT_FOLLOW_UP_DAYS,
  SESSION_REMINDER_DAYS,
  STALLED_RAW_DELTA,
} from "@/lib/rebook/thresholds";

export const metadata: Metadata = { title: "Rebook" };

const VIEWS: { key: string; label: string; action: QueueAction | null }[] = [
  { key: "all", label: "Everyone", action: null },
  { key: "email", label: "To email", action: "email" },
  { key: "call", label: "To call", action: "call" },
  { key: "review", label: "To review", action: "review" },
];

/** The whole queue, and the outbox: every rebook message sent from this sandbox. */
export default async function RebookPage({ searchParams }: PageProps<"/dashboard/rebook">) {
  const { show } = await searchParams;
  const book = await loadBook();
  const byId = new Map(book.facts.map((f) => [f.client.id, f]));
  const view = VIEWS.find((v) => v.key === show) ?? VIEWS[0];
  const items = view.action ? book.queue.items.filter((i) => i.action === view.action) : book.queue.items;
  const rows = items.map((i) => toQueueRow(i, byId.get(i.clientId)!));
  const rebookTypes = new Set<string>(TRIGGER_ORDER);
  const outbox = book.input.messages.filter((m) => rebookTypes.has(m.type)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const ready = book.queue.items.reduce((n, i) => n + (i.valueCents ?? 0), 0);
  const local = (instant: string) => new Intl.DateTimeFormat("en-CA", { timeZone: book.clinic.timezone }).format(new Date(instant));

  return (
    <div>
      <header className="reveal flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="t-label">
            {book.queue.items.length} waiting · {formatPrice(ready)} ready to rebook
          </p>
          <h1 className="mt-3 font-display text-[clamp(40px,5vw,56px)] font-light leading-[1.02] tracking-[-0.02em] text-ink">Rebook</h1>
          <p className="mt-3 max-w-xl text-[15px] text-text-2">
            Every rule is written down and every flag says why. Measured on raw scan data, never the flattering number.
          </p>
        </div>
        <nav aria-label="Filter the queue">
          <ul className="flex flex-wrap gap-1">
            {VIEWS.map((v) => {
              const active = v.key === view.key;
              const n = v.action ? book.queue.items.filter((i) => i.action === v.action).length : book.queue.items.length;
              return (
                <li key={v.key}>
                  <Link
                    href={v.key === "all" ? "/dashboard/rebook" : `/dashboard/rebook?show=${v.key}`}
                    aria-current={active ? "page" : undefined}
                    scroll={false}
                    className={cx(
                      "flex h-9 items-center gap-2 border px-3 text-[13px] transition-colors duration-200",
                      active ? "border-ink bg-ink text-porcelain" : "border-mist text-text-2 hover:border-ink hover:text-ink",
                    )}
                  >
                    {v.label}
                    <span className={cx("tabular-nums text-[12px]", active ? "text-ink-soft" : "text-text-3")}>{n}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </header>

      <section aria-label="Waiting" className="mt-12">
        <Queue rows={rows} demo={env.DEMO_MODE} empty="Nothing waiting here. Move the clock forward to see who comes due." />
      </section>

      <section aria-labelledby="outbox" className="mt-20">
        <div className="flex flex-wrap items-baseline justify-between gap-4">
          <h2 id="outbox" className="font-display text-[30px] font-light text-ink">
            Outbox
          </h2>
          {env.DEMO_MODE && <p className="t-caption !text-[12.5px]">Demo mode: messages are logged here, never emailed.</p>}
        </div>
        {outbox.length === 0 ? (
          <p className="t-caption mt-4 border-t border-mist pt-5">Nothing sent yet. Messages you send from the queue land here, word for word.</p>
        ) : (
          <ul className="mt-4 border-t border-mist">
            {outbox.map((m) => {
              const client = byId.get(m.clientId)?.client;
              return (
                <li key={m.id} className="border-b border-mist">
                  <details className="group">
                    <summary className="grid cursor-pointer list-none grid-cols-[minmax(0,1fr)_auto_1rem] items-baseline gap-x-6 gap-y-1 py-4 md:grid-cols-[11rem_minmax(0,1fr)_9rem_6rem_1rem] [&::-webkit-details-marker]:hidden">
                      <span className="text-[15px] text-ink">{client ? fullName(client) : "Removed client"}</span>
                      <span className="col-span-2 row-start-2 min-w-0 truncate text-[14px] text-text-2 md:col-span-1 md:row-start-auto">
                        {m.subject ?? m.body}
                      </span>
                      <span className="t-label hidden items-center gap-2 !text-[10.5px] md:flex">
                        <KindMarkStatic kind={m.type as TriggerKind} />
                        {TRIGGER_LABEL[m.type as TriggerKind]}
                      </span>
                      <span className="t-caption text-right !text-[12.5px]">
                        {m.status === "sent" ? (env.DEMO_MODE ? "Logged" : "Sent") : m.status === "skipped" ? "Done" : "Failed"} ·{" "}
                        {relativeDay(local(m.createdAt), book.today)}
                      </span>
                      <span aria-hidden className="text-[18px] leading-none text-text-3 transition-transform duration-200 ease-out group-open:rotate-45">
                        +
                      </span>
                    </summary>
                    {m.status !== "skipped" && (
                      <div className="pb-6 md:pl-[11rem]">
                        <p className="t-caption !text-[12.5px]">To {client?.email}</p>
                        <pre className="mt-3 max-w-2xl whitespace-pre-wrap font-sans text-[14.5px] leading-relaxed text-text-2">{m.body}</pre>
                      </div>
                    )}
                  </details>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="rules" className="mt-20">
        <h2 id="rules" className="t-label">
          The rules
        </h2>
        <dl className="mt-3 grid gap-x-10 sm:grid-cols-2">
          {RULES.map(([kind, rule]) => (
            <div key={kind} className="border-t border-mist py-4">
              <dt className="flex items-center gap-2 text-[14px] text-ink">
                <KindMarkStatic kind={kind} />
                {TRIGGER_LABEL[kind]}
              </dt>
              <dd className="mt-1 text-[13.5px] leading-relaxed text-text-2">{rule}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}

const RULES: [TriggerKind, string][] = [
  [
    "progress_moment",
    `A rescan in the last ${PROGRESS_MOMENT_FRESH_DAYS} days improved a priority concern by ${PROGRESS_MOMENT_RAW_DELTA} or more raw points, and nothing is booked.`,
  ],
  ["stalled", `Two rescans in a row moved every priority concern less than ${STALLED_RAW_DELTA} raw points. Review the plan.`],
  ["missed", `A session is ${MISSED_AFTER_DAYS} days or more past its latest due date and isn't booked.`],
  ["next_session_due", `The next session of a course comes due within ${SESSION_REMINDER_DAYS} days and isn't booked.`],
  ["report_follow_up", `${REPORT_FOLLOW_UP_DAYS} days after the report, with nothing booked.`],
  ["progress_scan_due", `${PROGRESS_SCAN_AFTER_DAYS} days after a course's last session, with no scan since.`],
  ["maintenance_due", "A finished treatment reaches its maintenance interval."],
  ["lapsed", `${LAPSED_AFTER_DAYS} days past due. Email only with reminders consent; otherwise a call.`],
];
