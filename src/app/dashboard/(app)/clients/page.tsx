import type { Metadata } from "next";
import Link from "next/link";
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
      <header className="reveal flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="t-label">{all.length} clients</p>
          <h1 className="mt-3 font-display text-[clamp(40px,5vw,56px)] font-light leading-[1.02] tracking-[-0.02em] text-ink">Clients</h1>
        </div>
        <nav aria-label="Filter clients" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <ul className="flex gap-1">
            {FILTERS.map((f) => {
              const active = f.key === filter.key;
              return (
                <li key={f.key}>
                  <Link
                    href={f.key === "all" ? "/dashboard/clients" : `/dashboard/clients?show=${f.key}`}
                    aria-current={active ? "page" : undefined}
                    scroll={false}
                    className={cx(
                      "flex h-9 items-center gap-2 whitespace-nowrap border px-3 text-[13px] transition-colors duration-200",
                      active ? "border-ink bg-ink text-porcelain" : "border-mist text-text-2 hover:border-ink hover:text-ink",
                    )}
                  >
                    {f.label}
                    <span className={cx("tabular-nums text-[12px]", active ? "text-ink-soft" : "text-text-3")}>{count(f)}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </header>

      <table className="mt-12 w-full border-collapse text-left">
        <caption className="sr-only">Clients, with status, visits and their lead concern over time</caption>
        <thead>
          <tr className="border-b border-ink/80">
            <th scope="col" className="t-label py-3 pr-4 font-normal">Client</th>
            <th scope="col" className="t-label hidden py-3 pr-4 font-normal md:table-cell">Status</th>
            <th scope="col" className="t-label hidden py-3 pr-4 font-normal lg:table-cell">Last visit</th>
            <th scope="col" className="t-label hidden py-3 pr-4 font-normal lg:table-cell">Next visit</th>
            <th scope="col" className="t-label py-3 pr-4 text-right font-normal sm:text-left">Lead concern</th>
            <th scope="col" className="t-label hidden py-3 font-normal xl:table-cell">Waiting on</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const { client } = row.facts;
            const href = `/dashboard/clients/${client.id}`;
            return (
              <tr key={client.id} style={{ animationDelay: `${Math.min(i, 10) * 30}ms` }} className="reveal group relative border-b border-mist transition-colors duration-200 hover:bg-mist/40">
                <td className="py-4 pr-4 align-middle">
                  <Link href={href} className="block after:absolute after:inset-0 after:content-['']">
                    <span className="block font-display text-[21px] leading-tight text-ink">{fullName(client)}</span>
                    <span className="t-caption block !text-[12.5px] md:hidden">
                      {STATUS_LABEL[row.status]}
                    </span>
                    <span className="t-caption hidden !text-[12.5px] md:block">{client.email}</span>
                  </Link>
                </td>
                <td className="hidden py-4 pr-4 md:table-cell">
                  <StatusMark status={row.status} />
                </td>
                <td className="hidden py-4 pr-4 text-[14px] text-text-2 lg:table-cell">
                  {row.lastVisit ? relativeDay(row.lastVisit, book.today) : <span className="text-text-3">None yet</span>}
                </td>
                <td className="hidden py-4 pr-4 text-[14px] lg:table-cell">
                  {row.nextVisit ? <span className="text-ink">{relativeDay(row.nextVisit, book.today)}</span> : <span className="text-text-3">Not booked</span>}
                </td>
                <td className="py-4 pr-4">
                  {row.trend ? (
                    <span className="flex items-center justify-end gap-4 sm:justify-start">
                      <span className="w-28 text-[13.5px] text-text-2 hidden sm:block">{row.trend.label}</span>
                      <span className="w-14 text-right font-display text-[22px] font-light text-ink tabular-nums">
                        {row.trend.series[row.trend.series.length - 1]}
                      </span>
                      <span className={cx("w-9 text-[12.5px] tabular-nums", row.trend.delta && row.trend.delta > 0 ? "text-glacier-deep" : "text-text-3")}>
                        {row.trend.delta === null ? "" : row.trend.delta > 0 ? `+${row.trend.delta}` : row.trend.delta}
                      </span>
                      <Sparkline values={row.trend.series} className="hidden sm:block" />
                      <span className="sr-only">
                        {row.trend.delta === null ? "First scan" : `${row.trend.delta >= 0 ? "Up" : "Down"} ${Math.abs(row.trend.delta)} points since the first scan`}
                      </span>
                    </span>
                  ) : (
                    <span className="t-caption">No scan yet</span>
                  )}
                </td>
                <td className="hidden py-4 text-[13.5px] text-text-2 xl:table-cell">{row.item ? <WaitingOn row={row} /> : <span className="text-text-3">Nothing</span>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {rows.length === 0 && <p className="t-caption py-10">Nobody here right now.</p>}
    </div>
  );
}

function WaitingOn({ row }: { row: ClientRow }) {
  const what = row.item!.action === "email" ? "Message" : row.item!.action === "call" ? "Call" : "Plan review";
  return <span className="text-ink">{what}</span>;
}
