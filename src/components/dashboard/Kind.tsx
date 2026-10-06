import { cx } from "@/components/ui/cx";
import { Bloom } from "./Bloom";
import type { QueueRow } from "./queue-row";

type Kind = Pick<QueueRow, "kind" | "label" | "atRisk">;

/** A small square marks the kind: sea for a moment to act on, amber ring for at risk, ice for the rest. */
export function KindMark({ kind, atRisk }: { kind: QueueRow["kind"]; atRisk: boolean }) {
  return (
    <span
      aria-hidden
      className={cx(
        "inline-block h-[7px] w-[7px] shrink-0 rounded-[2px]",
        kind === "progress_moment" ? "bg-glacier-deep" : atRisk ? "border border-[#b8691f]" : "bg-glacier",
      )}
    />
  );
}

/** The kind, as a small tinted label. Never colour alone: the words are always there. */
export function KindChip({ row }: { row: Kind }) {
  const tone =
    row.kind === "progress_moment"
      ? "bg-[linear-gradient(90deg,rgba(255,214,196,0.55),rgba(244,185,163,0.35))] text-[#7d3447]"
      : row.atRisk
        ? "bg-[#e9a35f]/15 text-[#8a4b12]"
        : "bg-white/70 text-text-3 ring-1 ring-inset ring-[#0c1a22]/[0.06]";
  return (
    <span className={cx("inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-[10.5px] uppercase tracking-[0.12em]", tone)}>
      {row.kind === "progress_moment" ? <Bloom size={13} unfurl className="text-[#9e4a5d]" /> : <KindMark kind={row.kind} atRisk={row.atRisk} />}
      {row.label}
      {row.atRisk && row.kind !== "lapsed" && <span className="opacity-80">· At risk</span>}
    </span>
  );
}

/** The client's initials on a small tile, its finish set by why they're here. */
export function Monogram({ row, className }: { row: Pick<QueueRow, "kind" | "atRisk" | "name">; className?: string }) {
  const initials = row.name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("");
  const finish =
    row.kind === "progress_moment"
      ? "bg-[linear-gradient(140deg,#ffe4d8_0%,#f4b9a3_38%,#8fbfd6_100%)] text-white [text-shadow:0_1px_2px_rgba(125,52,71,0.35)]"
      : row.atRisk
        ? "bg-[linear-gradient(150deg,#1b3a4e_0%,#0b1a24_100%)] text-[#e2c07a]"
        : "bg-white/80 text-[#1e5a78] ring-1 ring-inset ring-white";
  return (
    <span
      aria-hidden
      className={cx(
        "grid h-[52px] w-[52px] shrink-0 place-items-center rounded-[15px] font-display text-[20px] tracking-[0.04em] shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_10px_20px_-14px_rgba(12,44,62,0.55)]",
        finish,
        className,
      )}
    >
      {initials}
    </span>
  );
}
