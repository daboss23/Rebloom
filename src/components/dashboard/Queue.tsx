"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { markDone, sendRebook, undoDone } from "@/app/dashboard/actions";
import { cx } from "@/components/ui/cx";
import { IconArrowUpRight, IconClose, IconMail, IconPhone } from "@/components/ui/Icons";
import type { QueueRow } from "./queue-row";

/** A small square, the queue's only ornament. Filled glacier: a moment to act on. Hollow: at risk. */
export function KindMark({ kind, atRisk }: { kind: QueueRow["kind"]; atRisk: boolean }) {
  return (
    <span
      aria-hidden
      className={cx(
        "inline-block h-[7px] w-[7px] shrink-0",
        kind === "progress_moment" ? "bg-glacier-deep" : atRisk ? "border border-ink" : "bg-sage/60",
      )}
    />
  );
}

const secondary =
  "inline-flex h-10 items-center justify-center gap-2 border px-4 text-[13.5px] whitespace-nowrap " +
  "transition-[background-color,border-color,color,transform] duration-200 ease-out active:scale-[0.97] disabled:opacity-40";

export function Queue({ rows, demo, empty, hideNames }: { rows: QueueRow[]; demo: boolean; empty: string; hideNames?: boolean }) {
  const [open, setOpen] = useState<QueueRow | null>(null);
  const [leaving, setLeaving] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<{ text: string; id: number; undo?: () => void } | null>(null);
  const [pending, start] = useTransition();
  const toastCount = useRef(0);
  // Edits survive closing the sheet, so a stray Escape never costs Dana her words.
  const [drafts, setDrafts] = useState<Record<string, { subject: string; body: string }>>({});
  const say = (text: string, undo?: () => void) => setToast({ text, id: ++toastCount.current, undo });

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), toast.undo ? 7000 : 4200);
    return () => clearTimeout(t);
  }, [toast]);

  const key = (row: QueueRow) => row.dedupeKey + row.clientId;
  const leave = (row: QueueRow, text: string, undo?: () => void) => {
    setLeaving((s) => new Set(s).add(key(row)));
    say(text, undo);
  };
  const back = (row: QueueRow) =>
    start(async () => {
      setToast(null);
      const result = await undoDone({ clientId: row.clientId, dedupeKey: row.dedupeKey });
      setLeaving((s) => {
        const next = new Set(s);
        next.delete(key(row));
        return next;
      });
      if (!result.ok) say(result.error ?? "Couldn't undo.");
    });

  const done = (row: QueueRow) =>
    start(async () => {
      const result = await markDone({ clientId: row.clientId, dedupeKey: row.dedupeKey });
      if (result.ok) leave(row, result.message ?? "Done.", () => back(row));
      else say(result.error ?? "Something went wrong.");
    });

  if (rows.length === 0) {
    return (
      <div className="border-y border-mist py-14 text-center">
        <p className="font-display text-[26px] font-light text-ink">All caught up.</p>
        <p className="t-caption mt-2">{empty}</p>
      </div>
    );
  }

  return (
    <>
      <ol className="border-t border-mist">
        {rows.map((row, i) => {
          const gone = leaving.has(key(row));
          return (
            <li
              key={row.clientId + row.dedupeKey}
              style={{ animationDelay: `${Math.min(i, 8) * 45}ms` }}
              className={cx(
                "reveal group relative grid gap-x-8 gap-y-3 border-b border-mist py-6",
                "md:grid-cols-[minmax(0,1fr)_6.5rem_12rem] md:items-center",
                "transition-[opacity,transform] duration-300 ease-out",
                gone && "pointer-events-none opacity-0 -translate-y-1",
              )}
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                  {!hideNames && (
                    <Link
                      href={row.href}
                      className="font-display text-[23px] leading-tight text-ink decoration-mist underline-offset-[6px] hover:underline"
                    >
                      {row.name}
                    </Link>
                  )}
                  <p className="t-label flex items-center gap-2 !text-[10.5px]">
                    <KindMark kind={row.kind} atRisk={row.atRisk} />
                    {row.label}
                    {row.atRisk && row.kind !== "lapsed" && <span>· At risk</span>}
                  </p>
                </div>
                <p className="mt-1.5 max-w-[46ch] text-[15px] leading-relaxed text-text-2">{row.reason}</p>
              </div>

              <div className="flex items-baseline gap-2 md:block md:text-right">
                {row.value ? (
                  <>
                    <p className="font-display text-[26px] font-light leading-none text-ink lining-nums tabular-nums">{row.value}</p>
                    <p className="t-caption !text-[12px] md:mt-1.5">{row.valueNote}</p>
                  </>
                ) : (
                  row.valueNote && <p className="t-caption !text-[12px]">{row.valueNote}</p>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 md:flex-col md:items-end">
                {row.action === "email" && (
                  <button type="button" onClick={() => setOpen(row)} className={cx(secondary, "border-ink text-ink hover:bg-ink hover:text-porcelain")}>
                    <IconMail width={16} height={16} />
                    Review &amp; send
                  </button>
                )}
                {row.action === "call" && (
                  <>
                    <a href={`tel:${row.phone ?? ""}`} className={cx(secondary, "border-ink text-ink hover:bg-ink hover:text-porcelain")}>
                      <IconPhone width={16} height={16} />
                      Call {row.phone}
                    </a>
                    <button type="button" disabled={pending} onClick={() => done(row)} className="text-[12.5px] text-text-3 underline decoration-mist underline-offset-4 hover:text-ink hover:decoration-ink">
                      Mark as called
                    </button>
                  </>
                )}
                {row.action === "review" && (
                  <>
                    <Link href={row.href} className={cx(secondary, "border-ink text-ink hover:bg-ink hover:text-porcelain")}>
                      Open brief
                      <IconArrowUpRight width={15} height={15} />
                    </Link>
                    <button type="button" disabled={pending} onClick={() => done(row)} className="text-[12.5px] text-text-3 underline decoration-mist underline-offset-4 hover:text-ink hover:decoration-ink">
                      Mark as reviewed
                    </button>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      {open && (
        <SendSheet
          row={open}
          demo={demo}
          draft={drafts[key(open)] ?? null}
          onDraft={(d) => setDrafts((all) => ({ ...all, [key(open)]: d }))}
          onClose={() => setOpen(null)}
          onSent={(text) => {
            setDrafts((all) => {
              const rest = { ...all };
              delete rest[key(open)];
              return rest;
            });
            leave(open, text);
            setOpen(null);
          }}
        />
      )}

      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
        {toast && (
          <div key={toast.id} className="toast on-dark pointer-events-auto flex max-w-md items-center gap-6 bg-ink py-3.5 pl-5 pr-4 text-[13.5px] text-porcelain">
            <p>{toast.text}</p>
            {toast.undo && (
              <button type="button" onClick={toast.undo} className="text-[13px] text-glacier underline underline-offset-4 hover:text-porcelain">
                Undo
              </button>
            )}
          </div>
        )}
      </div>
    </>
  );
}

/** The pre-written email, ready to edit. Nothing goes out until Dana presses Send. */
function SendSheet({
  row,
  demo,
  draft,
  onDraft,
  onClose,
  onSent,
}: {
  row: QueueRow;
  demo: boolean;
  draft: { subject: string; body: string } | null;
  onDraft: (d: { subject: string; body: string }) => void;
  onClose: () => void;
  onSent: (text: string) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [subject, setSubject] = useState(draft?.subject ?? row.draft?.subject ?? "");
  const [body, setBody] = useState(draft?.body ?? row.draft?.body ?? "");
  const edited = subject !== (row.draft?.subject ?? "") || body !== (row.draft?.body ?? "");
  // Close through the dialog, so the browser hands focus back to the button that opened it.
  const dismiss = () => {
    onDraft({ subject, body });
    ref.current?.close();
    onClose();
  };
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    // Closing happens by unmounting. Calling close() here would fire a "close" event that React's
    // development double-mount would read as the user closing the sheet.
  }, []);

  const send = () =>
    start(async () => {
      setError(null);
      const result = await sendRebook({ clientId: row.clientId, dedupeKey: row.dedupeKey, subject, body });
      if (result.ok) {
        ref.current?.close();
        onSent(result.message ?? "Sent.");
      }
      else setError(result.error ?? "Something went wrong. Please try again.");
    });

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(e) => {
        // Escape: close through React, so state and the dialog agree. The draft is kept.
        e.preventDefault();
        dismiss();
      }}
      // A click on the dimmed page closes an untouched draft only; an edited one needs Cancel or Escape.
      onClick={(e) => e.target === ref.current && !edited && dismiss()}
      className="sheet fixed inset-y-0 right-0 left-auto m-0 h-dvh max-h-dvh w-full max-w-[560px] border-l border-mist bg-porcelain p-0 text-text-2"
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
        className="flex h-full flex-col"
      >
        <header className="flex items-start justify-between gap-6 border-b border-mist px-7 pb-5 pt-7">
          <div>
            <p className="t-label flex items-center gap-2 !text-[10.5px]">
              <KindMark kind={row.kind} atRisk={row.atRisk} />
              {row.label}
            </p>
            <h2 id={titleId} className="mt-2 font-display text-[30px] font-light leading-tight text-ink">
              Review &amp; send
            </h2>
            <p className="mt-1 text-[14px] text-text-2">
              To {row.name} <span className="text-text-3">· {row.email}</span>
            </p>
          </div>
          <button type="button" onClick={dismiss} aria-label="Close" className="-mr-2 grid h-10 w-10 place-items-center text-text-3 transition-colors duration-150 hover:text-ink">
            <IconClose />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-7 py-6">
          <p className="border-l border-glacier-deep pl-4 text-[14px] leading-relaxed text-text-2">{row.reason}</p>

          <label className="mt-7 block">
            <span className="t-label">Subject</span>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="mt-2 h-11 w-full border-0 border-b border-mist bg-transparent text-[16px] text-ink outline-none transition-colors duration-200 focus:border-ink"
            />
          </label>

          <label className="mt-7 block">
            <span className="t-label">Message</span>
            <textarea
              autoFocus
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={15}
              className="mt-3 w-full resize-y border border-mist bg-transparent p-4 text-[15px] leading-relaxed text-ink outline-none transition-colors duration-200 focus:border-ink"
            />
          </label>
          {error && (
            <p role="alert" className="mt-3 text-[14px] text-ink">
              {error}
            </p>
          )}
        </div>

        <footer className="border-t border-mist px-7 py-5">
          {demo && <p className="t-caption mb-4 !text-[12.5px]">Demo mode: this message is logged in the outbox, not emailed.</p>}
          <div className="flex items-center justify-end gap-5">
            <button type="button" onClick={dismiss} className="h-11 text-[14px] text-text-3 transition-colors duration-150 hover:text-ink">
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending}
              className="inline-flex h-12 min-w-36 items-center justify-center bg-ink px-6 text-[15px] text-porcelain transition-[background-color,transform,opacity] duration-200 ease-out hover:bg-[#2a3035] active:scale-[0.98] disabled:opacity-60"
            >
              {pending ? "Sending" : "Send email"}
            </button>
          </div>
        </footer>
      </form>
    </dialog>
  );
}
