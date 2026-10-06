"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { markDone, sendRebook, undoDone } from "@/app/dashboard/actions";
import { cx } from "@/components/ui/cx";
import { IconArrowUpRight, IconClose, IconMail, IconPhone } from "@/components/ui/Icons";
import { Bloom } from "./Bloom";
import { KindChip, KindMark, Monogram } from "./Kind";
import { LightField } from "./LightField";
import type { QueueRow } from "./queue-row";

export function Queue({ rows, demo, empty, hideNames }: { rows: QueueRow[]; demo: boolean; empty: string; hideNames?: boolean }) {
  const [open, setOpen] = useState<QueueRow | null>(null);
  const [leaving, setLeaving] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<{ text: string; id: number; undo?: () => void; bloom?: boolean } | null>(null);
  const [pending, start] = useTransition();
  const toastCount = useRef(0);
  // Edits survive closing the sheet, so a stray Escape never costs Dana her words.
  const [drafts, setDrafts] = useState<Record<string, { subject: string; body: string }>>({});
  const say = (text: string, undo?: () => void, bloom?: boolean) => setToast({ text, id: ++toastCount.current, undo, bloom });

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), toast.undo ? 7000 : 4200);
    return () => clearTimeout(t);
  }, [toast]);

  const key = (row: QueueRow) => row.dedupeKey + row.clientId;
  const leave = (row: QueueRow, text: string, undo?: () => void, bloom?: boolean) => {
    setLeaving((s) => new Set(s).add(key(row)));
    say(text, undo, bloom);
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
      <div className="glass px-8 py-14 text-center">
        <p className="font-display text-[32px] font-light text-ink">All caught up.</p>
        <p className="t-caption mt-2">{empty}</p>
      </div>
    );
  }

  return (
    <>
      <ol className="space-y-3">
        {rows.map((row, i) => {
          const gone = leaving.has(key(row));
          return (
            <li
              key={row.clientId + row.dedupeKey}
              style={{ animationDelay: `${120 + Math.min(i, 8) * 70}ms` }}
              className={cx(
                "glass lift sheen grid gap-x-6 gap-y-4 p-5 sm:p-6",
                row.kind === "progress_moment" ? "moment !border-[#f4b9a3]/60" : "focus-in",
                "md:grid-cols-[auto_minmax(0,1fr)_7.5rem_auto] md:items-center",
                gone && "pointer-events-none !opacity-0 !-translate-y-1 transition-[opacity,transform] duration-300",
              )}
            >
              <div className="flex items-center gap-4 md:contents">
                <Monogram row={row} />
                <div className="min-w-0 md:hidden">
                  {!hideNames && <p className="font-display text-[22px] leading-tight text-ink">{row.name}</p>}
                  <div className="mt-1">
                    <KindChip row={row} />
                  </div>
                </div>
              </div>

              <div className="min-w-0">
                <div className="hidden flex-wrap items-center gap-x-3 gap-y-1.5 md:flex">
                  {!hideNames && (
                    <Link
                      href={row.href}
                      className="font-display text-[24px] leading-tight text-ink decoration-[#9fc9dd] decoration-1 underline-offset-[6px] hover:underline"
                    >
                      {row.name}
                    </Link>
                  )}
                  <KindChip row={row} />
                </div>
                <p className="max-w-[52ch] text-[15px] leading-relaxed text-text-2 md:mt-1.5">{row.reason}</p>
              </div>

              <div className="flex items-baseline gap-2 md:block md:text-right">
                {row.value ? (
                  <>
                    <p className="gold-foil font-display text-[32px] font-light leading-none">{row.value}</p>
                    <p className="t-caption !text-[12px] md:mt-1.5">{row.valueNote}</p>
                  </>
                ) : (
                  row.valueNote && <p className="t-caption !text-[12px]">{row.valueNote}</p>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 md:flex-col md:items-end">
                {row.action === "email" && (
                  <button type="button" onClick={() => setOpen(row)} className="btn-sea">
                    <IconMail width={16} height={16} />
                    Review &amp; send
                  </button>
                )}
                {row.action === "call" && (
                  <>
                    <a href={`tel:${row.phone ?? ""}`} className="btn-sea">
                      <IconPhone width={16} height={16} />
                      Call {row.phone}
                    </a>
                    <button type="button" disabled={pending} onClick={() => done(row)} className="text-[12.5px] text-text-3 underline decoration-[#0c1a22]/20 underline-offset-4 hover:text-ink hover:decoration-ink">
                      Mark as called
                    </button>
                  </>
                )}
                {row.action === "review" && (
                  <>
                    <Link href={row.href} className="btn-ghost">
                      Open brief
                      <IconArrowUpRight width={15} height={15} />
                    </Link>
                    <button type="button" disabled={pending} onClick={() => done(row)} className="text-[12.5px] text-text-3 underline decoration-[#0c1a22]/20 underline-offset-4 hover:text-ink hover:decoration-ink">
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
            leave(open, text, undefined, true);
            setOpen(null);
          }}
        />
      )}

      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
        {toast && (
          <div key={toast.id} className="toast sea on-dark pointer-events-auto flex max-w-md items-center gap-6 rounded-[14px] py-3.5 pl-5 pr-4 text-[13.5px] shadow-[0_24px_48px_-20px_rgba(12,26,34,0.6)]">
            {toast.bloom && <Bloom size={22} unfurl className="text-[#f1d49a]" />}
            <p>{toast.text}</p>
            {toast.undo && (
              <button type="button" onClick={toast.undo} className="text-[13px] text-[#e2c07a] underline underline-offset-4 hover:text-white">
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
      className="sheet fixed inset-y-0 right-0 left-auto m-0 h-dvh max-h-dvh w-full max-w-[580px] border-0 bg-[#f4f8fa]/95 p-0 text-text-2 shadow-[-30px_0_80px_-30px_rgba(12,26,34,0.45)] backdrop-blur-2xl sm:rounded-l-[24px] sm:overflow-hidden"
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
        className="flex h-full flex-col"
      >
        <header className="sea on-dark relative overflow-hidden px-7 pb-7 pt-7">
          <LightField variant="sea" className="opacity-70" />
          <div className="relative flex items-start justify-between gap-6">
            <div>
              <p className="flex items-center gap-2 text-[10.5px] uppercase tracking-[0.16em] text-ink-soft">
                <KindMark kind={row.kind} atRisk={row.atRisk} />
                {row.label}
              </p>
              <h2 id={titleId} className="mt-3 font-display text-[36px] font-light leading-none text-white">
                Review &amp; send
              </h2>
              <p className="mt-3 text-[14px] text-ink-soft">
                To <span className="text-white">{row.name}</span> · {row.email}
              </p>
            </div>
            <button type="button" onClick={dismiss} aria-label="Close" className="-mr-2 grid h-10 w-10 place-items-center rounded-full text-ink-soft transition-colors duration-150 hover:bg-white/10 hover:text-white">
              <IconClose />
            </button>
          </div>
          <p className="relative mt-6 rounded-[12px] bg-white/[0.07] px-4 py-3 text-[14px] leading-relaxed text-[#dbe8ef] ring-1 ring-inset ring-white/10">{row.reason}</p>
        </header>

        <div className="flex-1 overflow-y-auto px-7 py-6">

          <label className="mt-7 block">
            <span className="t-label">Subject</span>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="mt-2 h-12 w-full rounded-[12px] border border-[#0c1a22]/10 bg-white/80 px-4 text-[16px] text-ink outline-none transition-[border-color,box-shadow] duration-200 focus:border-[#1e5a78]/50 focus:shadow-[0_0_0_4px_rgba(159,201,221,0.35)]"
            />
          </label>

          <label className="mt-7 block">
            <span className="t-label">Message</span>
            <textarea
              autoFocus
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={15}
              className="mt-2 w-full resize-y rounded-[12px] border border-[#0c1a22]/10 bg-white/80 p-4 text-[15px] leading-relaxed text-ink outline-none transition-[border-color,box-shadow] duration-200 focus:border-[#1e5a78]/50 focus:shadow-[0_0_0_4px_rgba(159,201,221,0.35)]"
            />
          </label>
          {error && (
            <p role="alert" className="mt-3 text-[14px] text-ink">
              {error}
            </p>
          )}
        </div>

        <footer className="border-t border-[#0c1a22]/[0.07] bg-white/50 px-7 py-5">
          {demo && <p className="t-caption mb-4 !text-[12.5px]">Demo mode: this message is logged in the outbox, not emailed.</p>}
          <div className="flex items-center justify-end gap-5">
            <button type="button" onClick={dismiss} className="h-11 text-[14px] text-text-3 transition-colors duration-150 hover:text-ink">
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending}
              className="btn-gold min-w-40 px-7 disabled:opacity-60"
            >
              {pending ? "Sending" : "Send email"}
            </button>
          </div>
        </footer>
      </form>
    </dialog>
  );
}
