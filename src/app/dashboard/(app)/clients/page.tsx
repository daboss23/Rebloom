import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader, pill } from "@/components/dashboard/PageHeader";
import { Sparkline } from "@/components/dashboard/Sparkline";
import { StatusMark } from "@/components/dashboard/StatusMark";
import { cx } from "@/components/ui/cx";
import type { ClientStatus } from "@/lib/domain";
import { loadBook } from "@/lib/dashboard/load";
import { clientRows, fullName, relativeDay, STATUS_LABEL, type ClientRow } from "@/lib/dashboard/view";
import { TRIGGER_ORDER } from "@/lib/rebook/engine";

export const metadata: Metadata = { title: "Clients" };

const FILTERS: { key: string; label: string; statuses: ClientStatus[] | null }[] = [
  { key: "all", label: "All", statuses: null },
  { key: "leads", label: "New leads", statuses: ["lead", "started"] },
  { key: "booked", label: "Booked", statuses: ["booked"] },
  { key: "course", label: "In course", statuses: ["in_course"] },
  { key: "complete", label: "Complete", statuses: ["course_complete"] },
  { key: "risk", label: "At risk", statuses: ["at_risk", "lapsed"] },
];

function sortRows(rows: ClientRow[]): ClientRow[] {
  const rank = (r: ClientRow) => (r.item ? TRIGGER_ORDER.indexOf(r.item.kind) : 100);
  return [...rows].sort((a, b) => rank(a) - rank(b) || fullName(a.facts.client).localeCompare(fullName(b.facts.client)));
}

export default async function ClientsPage({ searchParams }: PageProps<"/dashboard/clients">) {
  const { show } = await searchParams;
  const book = await loadBook();
  const all = sortRows(clientRows(book.facts, book.queue, book.now, book.clinic.timezone));
  const filter = FILTERS.find((f) => f.key === show) ?? FILTERS[0];
  const rows = filter.statuses ? all.filter((r) => filter.statuses!.includes(r.status)) : all;
  const count = (f: (typeof FILTERS)[number]) => (f.statuses ? all.filter((r) => f.statuses!.includes(r.status)).length : all.length);

  return (
    <div>
      <PageHeader
        kicker={`${all.length} clients · ${count(FILTERS[5])} at risk`}
        title="Clients"
        aside={
          <nav aria-label="Filter clients" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            <ul className="flex gap-2">
              {FILTERS.map((f) => {
                const active = f.key === filter.key;
                return (
                  <li key={f.key}>
                    <Link
                      href={f.key === "all" ? "/dashboard/clients" : `/dashboard/clients?show=${f.key}`}
                      aria-current={active ? "page" : undefined}
                      scroll={false}
                      className={pill(active)}
                    >
                      {f.label}
                      <span className={cx("tabular-nums text-[0.75rem]", active ? "text-white/70" : "text-text-3")}>{count(f)}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        }
      />

      <div className="glass focus-in mt-10 overflow-x-auto px-2 pb-2 sm:px-4" style={{ animationDelay: "120ms" }}>
      <table className="w-full border-collapse text-left">
        <caption className="sr-only">Clients, with status, visits and their lead concern over time</caption>
        <thead>
          <tr className="border-b border-[#0c1a22]/10">
            <th scope="col" className="t-label py-5 pl-4 pr-4 font-normal">Client</th>
            <th scope="col" className="t-label hidden py-3 pr-4 font-normal md:table-cell">Status</th>
            <th scope="col" className="t-label hidden whitespace-nowrap py-3 pr-4 font-normal xl:table-cell">Last visit</th>
            <th scope="col" className="t-label hidden whitespace-nowrap py-3 pr-4 font-normal xl:table-cell">Next visit</th>
            <th scope="col" className="t-label py-3 pr-4 text-right font-normal sm:text-left">Lead concern</th>
            <th scope="col" className="t-label hidden whitespace-nowrap py-3 font-normal 2xl:table-cell">Waiting on</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const { client } = row.facts;
            const href = `/dashboard/clients/${client.id}`;
            return (
              <tr key={client.id} style={{ animationDelay: `${150 + Math.min(i, 10) * 40}ms` }} className="focus-in group relative border-b border-[#0c1a22]/[0.06] transition-colors duration-200 last:border-0 hover:bg-white/70">
                <td className="py-4 pl-4 pr-4 align-middle">
                  <Link href={href} className="block after:absolute after:inset-0 after:content-['']">
                    <span className="flex items-center gap-3">
                      <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-[12px] bg-[linear-gradient(140deg,#e6f2f8,#b9d7e6)] font-display text-[1rem] text-[#1e5a78] shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]">
                        {(client.firstName?.[0] ?? "") + (client.lastName?.[0] ?? "")}
                      </span>
                      <span className="min-w-0">
                        <span className="block font-display text-[1.3125rem] leading-tight text-ink">{fullName(client)}</span>
                    <span className="t-caption block !text-[0.78125rem] md:hidden">
                      {STATUS_LABEL[row.status]}
                    </span>
                    <span className="t-caption hidden !text-[0.78125rem] xl:block">{client.email}</span>
                      </span>
                    </span>
                  </Link>
                </td>
                <td className="hidden py-4 pr-4 md:table-cell">
                  <StatusMark status={row.status} />
                </td>
                <td className="hidden whitespace-nowrap py-4 pr-4 text-[0.875rem] text-text-2 xl:table-cell">
                  {row.lastVisit ? relativeDay(row.lastVisit, book.today) : <span className="text-text-3">None yet</span>}
                </td>
                <td className="hidden whitespace-nowrap py-4 pr-4 text-[0.875rem] xl:table-cell">
                  {row.nextVisit ? <span className="text-ink">{relativeDay(row.nextVisit, book.today)}</span> : <span className="text-text-3">Not booked</span>}
                </td>
                <td className="py-4 pr-4">
                  {row.trend ? (
                    <span className="flex items-center justify-end gap-4 sm:justify-start">
                      <span className="w-28 text-[0.84375rem] text-text-2 hidden sm:block">{row.trend.label}</span>
                      <span className="w-14 text-right font-display text-[1.625rem] font-light text-ink tabular-nums">
                        {row.trend.series[row.trend.series.length - 1]}
                      </span>
                      <span className={cx("w-10 text-[0.78125rem] tabular-nums", row.trend.delta && row.trend.delta > 0 ? "font-medium text-[color:var(--growth)]" : "text-text-3")}>
                        {row.trend.delta === null ? "" : row.trend.delta > 0 ? `+${row.trend.delta}` : row.trend.delta}
                      </span>
                      <Sparkline values={row.trend.series} className="max-[1439px]:hidden" />
                      <span className="sr-only">
                        {row.trend.delta === null ? "First scan" : `${row.trend.delta >= 0 ? "Up" : "Down"} ${Math.abs(row.trend.delta)} points since the first scan`}
                      </span>
                    </span>
                  ) : (
                    <span className="t-caption">No scan yet</span>
                  )}
                </td>
                <td className="hidden whitespace-nowrap py-4 text-[0.84375rem] text-text-2 2xl:table-cell">{row.item ? <WaitingOn row={row} /> : <span className="text-text-3">Nothing</span>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {rows.length === 0 && <p className="t-caption px-4 py-10">Nobody here right now.</p>}
      </div>
    </div>
  );
}

function WaitingOn({ row }: { row: ClientRow }) {
  const what = row.item!.action === "email" ? "Message" : row.item!.action === "call" ? "Call" : "Plan review";
  return <span className="text-ink">{what}</span>;
}
