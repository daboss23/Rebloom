"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { markDone, sendRebook, sendRebookText, undoDone } from "@/app/dashboard/actions";
import { cx } from "@/components/ui/cx";
import { IconArrowUpRight, IconClose, IconMail, IconMessage, IconPhone } from "@/components/ui/Icons";
import { formatUsPhone, TEXT_MAX_CHARS, textParts, toUsE164 } from "@/lib/sms/text";
import { Bloom } from "./Bloom";
import { KindChip, KindMark, Monogram } from "./Kind";
import { LightField } from "./LightField";
import type { QueueRow } from "./queue-row";

/** `onBrief`: the queue is showing on this client's own brief, so it drops their name and the link back to it. */
export function Queue({
  rows,
  demo,
  realCopy = false,
  empty,
  onBrief = false,
}: {
  rows: QueueRow[];
  demo: boolean;
  /** Demo mode with Resend set up: the sheet offers to email a real copy to whoever is trying the demo. */
  realCopy?: boolean;
  empty: string;
  onBrief?: boolean;
}) {
  const [open, setOpen] = useState<QueueRow | null>(null);
  const [leaving, setLeaving] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<{ text: string; id: number; undo?: () => void; bloom?: boolean } | null>(null);
  const [pending, start] = useTransition();
  const toastCount = useRef(0);
  // Edits survive closing the sheet, so a stray Escape never costs Dana her words.
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
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

  const toastRegion = (
    <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
      {toast && (
        <div key={toast.id} className="toast sea on-dark pointer-events-auto flex max-w-md items-center gap-6 rounded-[14px] py-3.5 pl-5 pr-4 text-[0.875rem] shadow-[0_24px_48px_-20px_rgba(12,26,34,0.6)]">
          {toast.bloom && <Bloom size={22} unfurl className="text-[#f1d49a]" />}
          <p>{toast.text}</p>
          {toast.undo && (
            <button type="button" onClick={toast.undo} className="text-[0.8125rem] text-[#e2c07a] underline underline-offset-4 hover:text-white">
              Undo
            </button>
          )}
        </div>
      )}
    </div>
  );

  // On a brief, the client's one row leaves once it's handled. The toast, and its Undo, stay.
  if (rows.length === 0 && onBrief) return toastRegion;
  if (rows.length === 0) {
    return (
      <div className="glass px-8 py-14 text-center">
        <p className="font-display text-[2rem] font-light text-ink">All caught up.</p>
        <p className="t-caption mt-2">{empty}</p>
      </div>
    );
  }

  return (
    <>
      {/* Rows lay out by the room they have, not the screen: beside Today's side column, a laptop leaves them narrow. */}
      <ol className="@container space-y-3">
        {rows.map((row, i) => {
          const gone = leaving.has(key(row));
          return (
            <li
              key={row.clientId + row.dedupeKey}
              style={{ animationDelay: `${120 + Math.min(i, 8) * 70}ms` }}
              className={cx(
                "glass lift sheen grid gap-x-6 gap-y-4 p-5 sm:p-6",
                row.kind === "progress_moment" ? "moment !border-[#f4b9a3]/60" : "focus-in",
                "@2xl:grid-cols-[auto_minmax(0,1fr)_120px_auto] @2xl:items-center",
                gone && "pointer-events-none !opacity-0 !-translate-y-1 transition-[opacity,transform] duration-300",
              )}
            >
              <div className="flex items-center gap-4 @2xl:contents">
                <Monogram row={row} />
                <div className="min-w-0 @2xl:hidden">
                  {!onBrief && <p className="font-display text-[1.375rem] leading-tight text-ink">{row.name}</p>}
                  <div className="mt-1">
                    <KindChip row={row} />
                  </div>
                </div>
              </div>

              <div className="min-w-0">
                <div className="hidden flex-wrap items-center gap-x-3 gap-y-1.5 @2xl:flex">
                  {!onBrief && (
                    <Link
                      href={row.href}
                      className="font-display text-[1.5rem] leading-tight text-ink decoration-[#9fc9dd] decoration-1 underline-offset-[6px] hover:underline"
                    >
                      {row.name}
                    </Link>
                  )}
                  <KindChip row={row} />
                </div>
                <p className="max-w-[52ch] text-[0.9375rem] leading-relaxed text-text-2 @2xl:mt-1.5">{row.reason}</p>
                {row.reply && (
                  // They wrote back (D-081): a pre-written message now would talk past them.
                  <p className="mt-3 max-w-[56ch] border-t border-[#0c1a22]/[0.06] pt-3 text-[0.875rem] leading-relaxed text-text-2">
                    <span className="font-medium text-[#7a5014]">Wrote back: </span>
                    &ldquo;{row.reply}&rdquo;{" "}
                    {onBrief ? (
                      <span className="text-text-3">Answer below first.</span>
                    ) : (
                      <Link href={`${row.href}#conversation`} className="text-[#1e5a78] underline decoration-[#1e5a78]/30 underline-offset-4 hover:decoration-[#1e5a78]">
                        Answer first
                      </Link>
                    )}
                  </p>
                )}
                {row.agent?.status === "working" && (
                  // The morning run is writing this one (D-097). The standard message is there meanwhile.
                  <p aria-live="polite" className="mt-3 grid max-w-[56ch] grid-cols-[16px_minmax(0,1fr)] items-start gap-x-2.5 text-[0.8125rem] leading-relaxed text-text-3">
                    <Bloom size={16} className="mt-[0.2em] bloom-breathe text-[#9e4a5d]" />
                    <span>
                      Rebloom is drafting {row.action === "text" ? "a text" : "an email"} for {row.name.split(" ")[0]}
                      {row.agent.steps.length ? ` · ${row.agent.steps[row.agent.steps.length - 1]}` : "."}
                    </span>
                  </p>
                )}
              </div>

              <div className="flex items-baseline gap-2 @2xl:block @2xl:text-right">
                {row.value ? (
                  <>
                    <p className="gold-foil font-display text-[2rem] font-light leading-none">{row.value}</p>
                    <p className="t-caption !text-[0.8125rem] @2xl:mt-1.5">{row.valueNote}</p>
                  </>
                ) : (
                  row.valueNote && <p className="t-caption !text-[0.8125rem]">{row.valueNote}</p>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 @2xl:flex-col @2xl:items-end">
                {(row.action === "email" || row.action === "text") && (
                  <button type="button" onClick={() => setOpen(row)} className="btn-sea">
                    {row.agent?.status === "ready" ? (
                      <Bloom size={16} className="text-[#f1d49a]" />
                    ) : row.action === "text" ? (
                      <IconMessage width={16} height={16} />
                    ) : (
                      <IconMail width={16} height={16} />
                    )}
                    {row.agent?.status === "ready" ? "Review draft" : <>Review &amp; send</>}
                  </button>
                )}
                {row.action === "call" && (
                  <>
                    <a href={`tel:${row.phone ?? ""}`} className="btn-sea">
                      <IconPhone width={16} height={16} />
                      Call {row.phone}
                    </a>
                    <button type="button" disabled={pending} onClick={() => done(row)} className="text-[0.8125rem] text-text-3 underline decoration-[#0c1a22]/20 underline-offset-4 hover:text-ink hover:decoration-ink">
                      Mark as called
                    </button>
                  </>
                )}
                {row.action === "review" &&
                  (onBrief ? (
                    // Already on the brief: reviewing it is the only thing left to do here.
                    <button type="button" disabled={pending} onClick={() => done(row)} className="btn-ghost">
                      Mark as reviewed
                    </button>
                  ) : (
                    <>
                      <Link href={row.href} className="btn-ghost">
                        Open brief
                        <IconArrowUpRight width={15} height={15} />
                      </Link>
                      <button type="button" disabled={pending} onClick={() => done(row)} className="text-[0.8125rem] text-text-3 underline decoration-[#0c1a22]/20 underline-offset-4 hover:text-ink hover:decoration-ink">
                        Mark as reviewed
                      </button>
                    </>
                  ))}
              </div>
            </li>
          );
        })}
      </ol>

      {open && (
        <SendSheet
          row={open}
          demo={demo}
          realCopy={realCopy}
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

      {toastRegion}
    </>
  );
}

const COPY_KEY = "rb_demo_copy_to";

/** Dana's edits to one row, kept when the sheet closes. */
export interface Draft {
  channel: "email" | "text";
  subject: string;
  body: string;
  text: string;
  /** Whether the agent's draft is the one in the field (D-097). */
  fromAgent: boolean;
}

const field =
  "w-full rounded-[12px] border border-[#0c1a22]/10 bg-white/80 text-ink outline-none transition-[border-color,box-shadow] duration-200 focus:border-[#1e5a78]/50 focus:shadow-[0_0_0_4px_rgba(159,201,221,0.35)]";

/** The pre-written email, or text (D-080), ready to edit. Nothing goes out until Dana presses Send. */
function SendSheet({
  row,
  demo,
  realCopy,
  draft,
  onDraft,
  onClose,
  onSent,
}: {
  row: QueueRow;
  demo: boolean;
  realCopy: boolean;
  draft: Draft | null;
  onDraft: (d: Draft) => void;
  onClose: () => void;
  onSent: (text: string) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  // The morning run's draft (D-097), for the channel it was written for, when the queue can still send that way.
  const agent = row.agent?.status === "ready" && row.agent.body && (row.agent.channel === "sms" ? row.text : row.draft) ? row.agent : null;
  const agentChannel: Draft["channel"] | null = agent ? (agent.channel === "sms" ? "text" : "email") : null;
  const [fromAgent, setFromAgent] = useState(draft?.fromAgent ?? Boolean(agent));
  // What each field starts from: the agent's version where it wrote one, else the engine's standard message.
  const startBody = fromAgent && agentChannel === "email" ? agent!.body! : (row.draft?.body ?? "");
  const startText = fromAgent && agentChannel === "text" ? agent!.body! : (row.text ?? "");
  const [channel, setChannel] = useState<Draft["channel"]>(draft?.channel ?? agentChannel ?? (row.draft ? "email" : "text"));
  const [subject, setSubject] = useState(draft?.subject ?? row.draft?.subject ?? "");
  const [body, setBody] = useState(draft?.body ?? startBody);
  const [text, setText] = useState(draft?.text ?? startText);
  const [how, setHow] = useState(false);
  const edited = subject !== (row.draft?.subject ?? "") || body !== startBody || text !== startText;
  /** Swaps the field between the agent's draft and the standard message. */
  const useVersion = (agentVersion: boolean) => {
    setFromAgent(agentVersion);
    if (agentChannel === "email") setBody(agentVersion ? agent!.body! : (row.draft?.body ?? ""));
    if (agentChannel === "text") setText(agentVersion ? agent!.body! : (row.text ?? ""));
  };
  const showingAgent = Boolean(agent) && fromAgent && channel === agentChannel;
  const both = Boolean(row.draft && row.text);
  // Only a switch animates; opening the sheet has its own slide.
  const [switched, setSwitched] = useState(false);
  const isText = channel === "text";
  // Close through the dialog, so the browser hands focus back to the button that opened it.
  const dismiss = () => {
    onDraft({ channel, subject, body, text, fromAgent });
    ref.current?.close();
    onClose();
  };
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  // Whoever is trying the demo types their own address once; the next email in the queue remembers it.
  // The sheet only ever mounts after a click, never on the server, so storage can be read straight away.
  const [copyTo, setCopyTo] = useState(() => {
    try {
      return localStorage.getItem(COPY_KEY) ?? "";
    } catch {
      return ""; // Storage blocked: the field just starts empty.
    }
  });
  const firstName = row.name.split(" ")[0];
  const mobile = toUsE164(row.phone);

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
      const to = !isText && realCopy ? copyTo.trim() : "";
      // Sent from the agent's draft: what Dana sent is kept beside it, so the next one sounds more like her.
      const draftId = showingAgent ? agent!.id : undefined;
      const result = isText
        ? await sendRebookText({ clientId: row.clientId, dedupeKey: row.dedupeKey, body: text, draftId })
        : await sendRebook({ clientId: row.clientId, dedupeKey: row.dedupeKey, subject, body, copyTo: to, draftId });
      if (result.ok) {
        try {
          if (to) localStorage.setItem(COPY_KEY, to);
        } catch {
          // Not remembered next time; nothing else depends on it.
        }
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
              <p className="flex items-center gap-2 text-[0.75rem] uppercase tracking-[0.16em] text-ink-soft">
                <KindMark kind={row.kind} atRisk={row.atRisk} />
                {row.label}
              </p>
              <h2 id={titleId} className="mt-3 font-display text-[2.25rem] font-light leading-none text-white">
                Review &amp; send
              </h2>
              <p className="mt-3 text-[0.875rem] text-ink-soft">
                To <span className="text-white">{row.name}</span> · {isText ? (mobile ? formatUsPhone(mobile) : row.phone) : row.email}
              </p>
            </div>
            <button type="button" onClick={dismiss} aria-label="Close" className="-mr-2 grid h-10 w-10 place-items-center rounded-full text-ink-soft transition-colors duration-150 hover:bg-white/10 hover:text-white">
              <IconClose />
            </button>
          </div>
          <p className="relative mt-6 rounded-[12px] bg-white/[0.07] px-4 py-3 text-[0.875rem] leading-relaxed text-[#dbe8ef] ring-1 ring-inset ring-white/10">{row.reason}</p>
        </header>

        <div className="flex-1 overflow-y-auto px-7 py-6">
          {agent && channel === agentChannel && (
            <AgentLine agent={agent} firstName={firstName} showing={showingAgent} how={how} onHow={() => setHow((h) => !h)} onUse={useVersion} />
          )}
          {both && (
            <ChannelSwitch
              value={channel}
              onChange={(c) => {
                setChannel(c);
                setSwitched(true);
                setError(null);
              }}
            />
          )}

          {isText ? (
            <TextDraft key="text" animate={switched} firstName={firstName} sender={row.sender} text={text} onText={setText} />
          ) : (
            <div key="email" className={cx(switched && "sheet-swap")}>
              <label className="mt-7 block">
                <span className="t-label">Subject</span>
                <input value={subject} onChange={(e) => setSubject(e.target.value)} className={cx(field, "mt-2 h-12 px-4 text-[1rem]")} />
              </label>

              <label className="mt-7 block">
                <span className="t-label">Message</span>
                <textarea
                  // Focus lands here when the sheet opens; after a switch it stays on the switch.
                  autoFocus={!switched}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={15}
                  className={cx(field, "mt-2 resize-y p-4 text-[0.9375rem] leading-relaxed")}
                />
              </label>
              {realCopy && (
                <label className="mt-7 block">
                  <span className="t-label">Send a real copy to you</span>
                  <input
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    value={copyTo}
                    onChange={(e) => setCopyTo(e.target.value)}
                    placeholder="you@example.com"
                    aria-describedby={`${titleId}-copy`}
                    className={cx(field, "mt-2 h-12 px-4 text-[1rem] placeholder:text-text-3")}
                  />
                  <span id={`${titleId}-copy`} className="t-caption mt-2 block !text-[0.8125rem]">
                    {firstName} is a sample client, so this message stays in the outbox. Add your address to receive the email exactly as {firstName} would.
                  </span>
                </label>
              )}
            </div>
          )}
          {error && (
            <p role="alert" className="mt-3 text-[0.875rem] text-ink">
              {error}
            </p>
          )}
        </div>

        <footer className="border-t border-[#0c1a22]/[0.07] bg-white/50 px-7 py-5">
          {demo && (
            <p className="t-caption mb-4 !text-[0.8125rem]">
              {isText
                ? "Demo mode: this text is logged in the outbox, not sent."
                : realCopy && copyTo.trim()
                  ? `Demo mode: ${firstName}'s message is logged in the outbox. A real copy is emailed to you.`
                  : "Demo mode: this message is logged in the outbox, not emailed."}
            </p>
          )}
          <div className="flex items-center justify-end gap-5">
            <button type="button" onClick={dismiss} className="h-11 text-[0.875rem] text-text-3 transition-colors duration-150 hover:text-ink">
              Cancel
            </button>
            <button
              type="submit"
              disabled={pending}
              className="btn-gold min-w-40 px-7 disabled:opacity-60"
            >
              {pending ? "Sending" : isText ? "Send text" : "Send email"}
            </button>
          </div>
        </footer>
      </form>
    </dialog>
  );
}

/**
 * The morning run's draft in the sheet (D-097), in the brief's own words and look (D-093): one quiet line, what to
 * check, how it was written behind a link, and the clinic's standard message one tap away.
 */
function AgentLine({
  agent,
  firstName,
  showing,
  how,
  onHow,
  onUse,
}: {
  agent: NonNullable<QueueRow["agent"]>;
  firstName: string;
  showing: boolean;
  how: boolean;
  onHow: () => void;
  onUse: (agentVersion: boolean) => void;
}) {
  const stepsId = useId();
  const link = "underline decoration-[#0c1a22]/20 underline-offset-4 transition-colors duration-150 hover:text-ink hover:decoration-ink";
  return (
    <div className="mb-6 grid grid-cols-[16px_minmax(0,1fr)] items-start gap-x-2.5 text-[0.8125rem] leading-relaxed text-text-3">
      <Bloom size={16} unfurl={showing} className={cx("mt-[0.2em]", showing ? "text-[#9e4a5d]" : "text-text-3")} />
      <div>
        {showing ? (
          <p>
            <span className="text-ink">Drafted by Rebloom for {firstName}.</span> Read it, change anything, then send.{" "}
            <span className="whitespace-nowrap">
              <button type="button" onClick={onHow} aria-expanded={how} aria-controls={stepsId} className={link}>
                How it was written
              </button>
              <span aria-hidden className="mx-2 text-text-3/60">·</span>
              <button type="button" onClick={() => onUse(false)} className={link}>
                Use the standard message
              </button>
            </span>
          </p>
        ) : (
          <p>
            The clinic&apos;s standard message.{" "}
            <button type="button" onClick={() => onUse(true)} className={link}>
              Use Rebloom&apos;s draft for {firstName}
            </button>
          </p>
        )}
        {showing && agent.note && <p className="mt-1.5 text-text-2">Before you send: {agent.note}</p>}
        {showing && how && (
          <ol id={stepsId} className="focus-in mt-2 space-y-1">
            {agent.steps.map((step, i) => (
              <li key={i} className="flex gap-2.5">
                <span aria-hidden className="mt-[0.6em] h-1 w-1 shrink-0 rounded-full bg-[#9e4a5d]/60" />
                {step}
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

/** Email or text, for a client who said yes to both. Arrow keys move between them, as radios do. */
export function ChannelSwitch({ value, onChange }: { value: Draft["channel"]; onChange: (c: Draft["channel"]) => void }) {
  const options = [
    { id: "email", label: "Email", Icon: IconMail },
    { id: "text", label: "Text", Icon: IconMessage },
  ] as const;
  return (
    <div
      role="radiogroup"
      aria-label="Send as"
      className="relative grid grid-cols-2 rounded-[14px] bg-[#0c1a22]/[0.05] p-1 ring-1 ring-inset ring-[#0c1a22]/[0.06]"
      onKeyDown={(e) => {
        if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) return;
        e.preventDefault();
        const next = value === "email" ? "text" : "email";
        onChange(next);
        (e.currentTarget.querySelector(`[data-channel="${next}"]`) as HTMLElement | null)?.focus();
      }}
    >
      {/* The selected pill slides between the two, so the switch reads as one control. */}
      <span
        aria-hidden
        className={cx(
          "absolute inset-y-1 left-1 w-[calc(50%-4px)] rounded-[11px] bg-white shadow-[0_6px_16px_-10px_rgba(12,26,34,0.45)] transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none",
          value === "text" && "translate-x-full",
        )}
      />
      {options.map(({ id, label, Icon }) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={value === id}
          tabIndex={value === id ? 0 : -1}
          data-channel={id}
          onClick={() => onChange(id)}
          className={cx(
            "relative flex h-10 items-center justify-center gap-2 rounded-[11px] text-[0.875rem] transition-colors duration-200",
            value === id ? "text-ink" : "text-text-3 hover:text-ink",
          )}
        >
          <Icon width={16} height={16} />
          {label}
        </button>
      ))}
    </div>
  );
}

const LINK = /(https?:\/\/\S+)/g;

/** The text as it will land on their phone, above the field that writes it. */
function TextDraft({
  animate,
  firstName,
  sender,
  text,
  onText,
}: {
  animate: boolean;
  firstName: string;
  sender: string;
  text: string;
  onText: (t: string) => void;
}) {
  const countId = useId();
  const { parts, unicode } = textParts(text);
  const tooLong = text.trim().length > TEXT_MAX_CHARS;
  return (
    <div className={cx(animate && "sheet-swap")}>
      <figure className="mt-7">
        <figcaption className="t-label">On {firstName}&apos;s phone</figcaption>
        <div className="mt-2 rounded-[18px] bg-[linear-gradient(180deg,#ffffff_0%,#f3f7f9_100%)] px-4 pb-5 pt-4 shadow-[0_18px_40px_-28px_rgba(12,26,34,0.5)] ring-1 ring-inset ring-[#0c1a22]/[0.06]">
          <p className="text-center text-[0.75rem] text-text-3">{sender}</p>
          <p className="mt-3 w-fit max-w-[86%] whitespace-pre-wrap break-words rounded-[18px] rounded-bl-[6px] bg-[#e9eef1] px-4 py-2.5 text-[0.9375rem] leading-[1.45] text-ink">
            {text.trim()
              ? text.split(LINK).map((part, i) =>
                  i % 2 === 1 ? (
                    <span key={i} className="text-[#1e5a78] underline decoration-[#1e5a78]/40 underline-offset-2">
                      {part}
                    </span>
                  ) : (
                    part
                  ),
                )
              : <span className="text-text-3">Write a message below.</span>}
          </p>
        </div>
      </figure>

      <label className="mt-7 block">
        <span className="t-label">Text</span>
        <textarea
          autoFocus={!animate}
          value={text}
          onChange={(e) => onText(e.target.value)}
          rows={7}
          aria-describedby={countId}
          className={cx(field, "mt-2 resize-y p-4 text-[0.9375rem] leading-relaxed")}
        />
      </label>
      <p id={countId} aria-live="polite" className={cx("t-caption mt-2 !text-[0.8125rem]", tooLong && "!text-ink")}>
        {tooLong
          ? `${text.trim().length} characters. Keep it under ${TEXT_MAX_CHARS}.`
          : `${text.trim().length} characters, sent as ${parts === 1 ? "one text" : `${parts} parts`}${unicode ? ". An emoji or curly quote makes each part shorter" : ""}.`}
      </p>
    </div>
  );
}
