"use client";

// A client's conversation with the clinic (DECISIONS D-081): what the clinic sent and what they wrote back, in order,
// and the place Dana answers from. Nothing reaches the client until she presses Send.

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { answerClient, dismissDraft, markReplyHandled, redraft, undoDone } from "@/app/dashboard/actions";
import { cx } from "@/components/ui/cx";
import { IconMail, IconMessage } from "@/components/ui/Icons";
import type { DraftView } from "@/lib/agent/view";
import { TEXT_MAX_CHARS, textParts } from "@/lib/sms/text";
import { Bloom } from "./Bloom";
import { ChannelSwitch } from "./Queue";

export interface ConversationEntry {
  id: string;
  side: "client" | "clinic" | "note";
  channel: "email" | "sms";
  subject: string | null;
  body: string;
  /** "Tue, Oct 6 · 7:31pm", in the clinic's time zone. */
  when: string;
  status: string;
  /** Sent on its own (the report link, a booking email): quieter than what Dana wrote. */
  automatic: boolean;
  /** For a reply from an address or number that isn't the one on file. */
  sender: string | null;
  /** For the clinic's messages: kept in the outbox but never sent (a sample client, or a demo-mode rebook message). */
  logged: boolean;
  /** The reply waiting on an answer, with how long it has waited: "18 days". */
  waiting: string | null;
}

type Channel = "email" | "text";

/** Long threads open on the latest few; the rest is one press away. */
const SHOWN = 6;

const field =
  "w-full rounded-[14px] border border-[#0c1a22]/10 bg-white text-ink outline-none transition-[border-color,box-shadow] duration-200 focus:border-[#1e5a78]/45 focus:shadow-[0_0_0_4px_rgba(159,201,221,0.3)]";

const nonce = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

export function Conversation({
  clientId,
  firstName,
  entries,
  channels,
  defaultChannel,
  email,
  unsubscribed = false,
  phone,
  subject,
  waiting,
  demo,
  draft = null,
}: {
  clientId: string;
  firstName: string;
  entries: ConversationEntry[];
  /** Which ways Dana can write back: email needs an address, text a yes (or their own text) and no STOP. */
  channels: { email: boolean; text: boolean };
  defaultChannel: Channel;
  email: string | null;
  /** Their address unsubscribed from the clinic's emails (D-086): email waits until they write in. */
  unsubscribed?: boolean;
  /** Shown as typed: "(310) 555-0142". */
  phone: string | null;
  /** The subject an email answer goes under. */
  subject: string;
  waiting: boolean;
  demo: boolean;
  /** The agent's draft for what's in front of Dana (D-093): being written, ready to read, or not managed. */
  draft?: DraftView | null;
}) {
  // A draft the agent finished before the page opened goes straight into the composer (D-093).
  const ready = draft?.status === "ready" && draft.body ? draft : null;
  const draftChannel = (d: DraftView): Channel | null => (d.channel === "sms" && channels.text ? "text" : d.channel === "email" && channels.email ? "email" : null);
  const [channel, setChannel] = useState<Channel>(() => (ready && draftChannel(ready)) || defaultChannel);
  const [body, setBody] = useState(ready?.body ?? "");
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; id: number; undo?: () => void } | null>(null);
  const [all, setAll] = useState(false);
  const [pending, start] = useTransition();
  const key = useRef(nonce());
  const toastCount = useRef(0);
  const field_ = useRef<HTMLTextAreaElement>(null);
  const countId = useId();
  // Entries that weren't there when the page opened arrive into focus: an answer landing in the thread.
  const [seen] = useState(() => new Set(entries.map((e) => e.id)));
  const say = (text: string, undo?: () => void) => setToast({ text, id: ++toastCount.current, undo });

  // ---------- The agent's draft (D-093) ----------
  const router = useRouter();
  const [agent, setAgent] = useState<DraftView | null>(draft);
  // The draft now in the composer. Sent with the answer, so what Dana changed teaches the next draft.
  const [fromDraft, setFromDraft] = useState<string | null>(ready?.id ?? null);
  const [how, setHow] = useState(false);
  const filled = useRef(new Set<string>(ready ? [ready.id] : []));
  const typed = useRef(body);
  useEffect(() => {
    typed.current = body;
  }, [body]);
  // A refreshed page brings the latest draft, such as one a reply started while Dana was elsewhere.
  const draftKey = draft ? `${draft.id}:${draft.status}` : "";
  const [seenKey, setSeenKey] = useState(draftKey);
  if (draftKey !== seenKey) {
    setSeenKey(draftKey);
    setAgent(draft);
  }
  /** A finished draft goes into the composer once, and only if Dana hasn't started writing. */
  const fill = (d: DraftView) => {
    if (d.status !== "ready" || !d.body || filled.current.has(d.id) || typed.current.trim()) return;
    filled.current.add(d.id);
    setBody(d.body);
    setFromDraft(d.id);
    const c = draftChannel(d);
    if (c) setChannel(c);
  };
  // While it's being written, follow along. Once it's done, the page refreshes, so the plan panel shows any suggestion.
  useEffect(() => {
    if (!agent || agent.status !== "working") return;
    const stop = Date.now() + 5 * 60_000;
    let cancelled = false;
    const tick = async () => {
      if (cancelled) return;
      try {
        const res = await fetch(`/api/agent/drafts/${agent.id}`, { cache: "no-store" });
        if (res.ok) {
          const next = (await res.json()) as DraftView;
          if (cancelled) return;
          setAgent(next);
          if (next.status !== "working") {
            fill(next);
            return router.refresh();
          }
        }
      } catch {
        // A blip: the next tick tries again.
      }
      if (Date.now() < stop) timer = setTimeout(tick, 1500);
    };
    let timer = setTimeout(tick, 1200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [agent?.id, agent?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const setAside = () =>
    start(async () => {
      if (!agent) return;
      const id = agent.id;
      setAgent(null);
      setFromDraft(null);
      setHow(false);
      if (fromDraft === id) setBody("");
      await dismissDraft({ draftId: id });
      field_.current?.focus({ preventScroll: true });
    });

  const again = () =>
    start(async () => {
      if (!agent) return;
      const result = await redraft({ draftId: agent.id });
      if (result.ok) setAgent({ ...agent, status: "working", steps: [], body: null, note: null });
      else setError(result.error ?? "Rebloom can't draft this one just now.");
    });

  // Once nothing waits, the conversation moves below the brief (D-081). Follow it there, so the answer just sent
  // stays in view.
  const wasWaiting = useRef(waiting);
  useEffect(() => {
    if (wasWaiting.current && !waiting) {
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      field_.current?.closest("section")?.scrollIntoView({ block: "start", behavior: reduce ? "auto" : "smooth" });
    }
    wasWaiting.current = waiting;
  }, [waiting]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), toast.undo ? 7000 : 4200);
    return () => clearTimeout(t);
  }, [toast]);

  const isText = channel === "text";
  const trimmed = body.trim();
  const { parts, unicode } = textParts(trimmed);
  const tooLong = isText && trimmed.length > TEXT_MAX_CHARS;
  const canWrite = channels.email || channels.text;
  const hidden = all ? 0 : Math.max(0, entries.length - SHOWN);

  const send = () =>
    start(async () => {
      setError(null);
      const result = await answerClient({ clientId, channel, body, nonce: key.current, draftId: fromDraft ?? undefined });
      if (result.ok) {
        key.current = nonce();
        setBody("");
        setFromDraft(null);
        setAgent(null);
        setHow(false);
        say(result.message ?? "Sent.");
      } else setError(result.error ?? "Something went wrong. Please try again.");
    });

  const handled = () =>
    start(async () => {
      setError(null);
      const result = await markReplyHandled({ clientId });
      if (!result.ok) return setError(result.error ?? "Something went wrong.");
      const dedupeKey = result.dedupeKey!;
      say(result.message ?? "Marked as handled.", () =>
        start(async () => {
          setToast(null);
          const back = await undoDone({ clientId, dedupeKey });
          say(back.ok ? "Waiting on your answer again." : (back.error ?? "Couldn't undo."));
        }),
      );
    });

  return (
    <>
      {entries.length === 0 ? (
        <p className="t-caption mt-4 pt-1">
          Nothing yet. When {firstName} replies to an email or a text, it lands here, and you answer from here.
        </p>
      ) : (
        <ol aria-label={`Conversation with ${firstName}`} className="mt-6 space-y-6">
          {hidden > 0 && (
            <li className="flex justify-center">
              <button
                type="button"
                onClick={() => setAll(true)}
                className="rounded-full bg-white/70 px-4 py-1.5 text-[0.8125rem] text-text-3 ring-1 ring-inset ring-[#0c1a22]/[0.06] transition-colors duration-150 hover:text-ink"
              >
                Show {hidden} earlier {hidden === 1 ? "message" : "messages"}
              </button>
            </li>
          )}
          {entries.slice(hidden).map((entry) => (
            <Entry key={entry.id} entry={entry} firstName={firstName} arriving={!seen.has(entry.id)} />
          ))}
        </ol>
      )}

      {canWrite ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
          className="mt-10 rounded-[22px] bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(255,255,255,0.74))] p-4 shadow-[inset_0_1px_0_#fff,0_20px_40px_-28px_rgba(12,44,62,0.45)] ring-1 ring-inset ring-[#0c1a22]/[0.07] transition-shadow duration-300 focus-within:shadow-[inset_0_1px_0_#fff,0_0_0_4px_rgba(159,201,221,0.28),0_24px_44px_-26px_rgba(12,44,62,0.5)] sm:p-6"
        >
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
            <label htmlFor={`${countId}-body`} className="font-display text-[1.5rem] font-light leading-none text-ink">
              {waiting ? `Answer ${firstName}` : `Write to ${firstName}`}
            </label>
            {channels.email && channels.text ? (
              <div className="w-full sm:w-64">
                <ChannelSwitch
                  value={channel}
                  onChange={(c) => {
                    setChannel(c);
                    setError(null);
                    field_.current?.focus({ preventScroll: true });
                  }}
                />
              </div>
            ) : (
              <span className="flex items-center gap-2 text-[0.8125rem] text-text-3">
                {isText ? <IconMessage width={15} height={15} /> : <IconMail width={15} height={15} />}
                {isText ? "By text" : "By email"}
              </span>
            )}
          </div>
          <p className="mt-4 flex flex-wrap items-baseline gap-x-2 gap-y-1 border-t border-[#0c1a22]/[0.07] pt-3 text-[0.8125rem]">
            <span className="t-label !text-[0.75rem]">To</span>
            <span className="text-ink">{isText ? phone : email}</span>
            {isText ? (
              unsubscribed && !channels.email && <span className="text-text-3">· {firstName} unsubscribed from emails</span>
            ) : (
              <span className="min-w-0 truncate text-text-3">· {subject}</span>
            )}
          </p>
          {agent && <AgentLine agent={agent} inComposer={fromDraft === agent.id} how={how} onHow={() => setHow((o) => !o)} onClear={setAside} onRetry={again} busy={pending} />}
          <textarea
            id={`${countId}-body`}
            ref={field_}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              // Cmd or Ctrl + Enter sends, as in any mail app.
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && trimmed && !pending) {
                e.preventDefault();
                send();
              }
            }}
            // Tall enough for a drafted email to be read whole, without scrolling inside the box.
            rows={Math.min(14, Math.max(isText ? 3 : 5, Math.ceil(body.length / 78) + (body.match(/\n/g)?.length ?? 0)))}
            placeholder={isText ? `A short text to ${firstName}` : `Hi ${firstName},`}
            aria-describedby={isText ? countId : undefined}
            className={cx(field, "mt-3 resize-y p-4 focus-visible:outline-none! text-[0.9375rem] leading-relaxed placeholder:text-text-3")}
          />
          {isText && (
            <p id={countId} aria-live="polite" className={cx("t-caption mt-2 !text-[0.8125rem]", tooLong && "!text-ink")}>
              {tooLong
                ? `${trimmed.length} characters. Keep it under ${TEXT_MAX_CHARS}.`
                : `${trimmed.length} characters${trimmed ? `, sent as ${parts === 1 ? "one text" : `${parts} parts`}` : ""}${unicode ? ". An emoji or curly quote makes each part shorter" : ""}.`}
            </p>
          )}
          {error && (
            <p role="alert" className="mt-3 text-[0.875rem] text-ink">
              {error}
            </p>
          )}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
            <p className="t-caption !text-[0.8125rem]">
              {demo ? `Demo mode: logged here, not ${isText ? "texted" : "emailed"}.` : `${firstName}'s answer comes back here.`}
            </p>
            <div className="ml-auto flex flex-wrap items-center justify-end gap-x-5 gap-y-3">
              {waiting && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={handled}
                  className="tap whitespace-nowrap text-[0.8125rem] text-text-3 underline decoration-[#0c1a22]/20 underline-offset-4 transition-colors duration-150 hover:text-ink hover:decoration-ink"
                >
                  No answer needed
                </button>
              )}
              <button type="submit" disabled={pending || !trimmed || tooLong} className="btn-gold min-w-36 px-6 disabled:opacity-60">
                {pending ? "Sending" : isText ? "Send text" : "Send email"}
              </button>
            </div>
          </div>
        </form>
      ) : (
        <p className="t-caption mt-6">
          {unsubscribed
            ? `${firstName} unsubscribed from the clinic's emails. If they write in, you can answer here.`
            : `There's no email address or mobile number to write to ${firstName} at.`}
        </p>
      )}

      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
        {toast && (
          <div key={toast.id} className="toast sea on-dark pointer-events-auto flex max-w-md items-center gap-6 rounded-[14px] py-3.5 pl-5 pr-4 text-[0.875rem] shadow-[0_24px_48px_-20px_rgba(12,26,34,0.6)]">
            <p>{toast.text}</p>
            {toast.undo && (
              <button type="button" onClick={toast.undo} className="text-[0.8125rem] text-[#e2c07a] underline underline-offset-4 hover:text-white">
                Undo
              </button>
            )}
          </div>
        )}
      </div>
    </>
  );
}

/**
 * One quiet line above the composer (D-093). While the agent writes: a breathing bloom and what it's doing now.
 * Once the draft is in the composer: who wrote it, what to check, and how it was written behind one link. Never a
 * panel of its own: the draft is the composer's content, and Dana's to change.
 */
function AgentLine({
  agent,
  inComposer,
  how,
  onHow,
  onClear,
  onRetry,
  busy,
}: {
  agent: DraftView;
  inComposer: boolean;
  how: boolean;
  onHow: () => void;
  onClear: () => void;
  onRetry: () => void;
  busy: boolean;
}) {
  const what = agent.kind === "plan_review" ? "a note about their plan" : "an answer";
  const stepsId = useId();
  const quiet = "text-[0.8125rem] leading-relaxed text-text-3";
  const link = "underline decoration-[#0c1a22]/20 underline-offset-4 transition-colors duration-150 hover:text-ink hover:decoration-ink";

  // The bloom keeps its own column, so the words wrap beside it on a phone instead of under it.
  const row = cx(quiet, "mt-3 grid grid-cols-[16px_minmax(0,1fr)] items-start gap-x-2.5");
  const mark = "mt-[0.2em]";

  if (agent.status === "working") {
    const latest = agent.steps[agent.steps.length - 1];
    return (
      <p aria-live="polite" className={row}>
        <Bloom size={16} className={cx(mark, "bloom-breathe text-[#9e4a5d]")} />
        <span>
          Rebloom is drafting {what}
          {latest ? <span> · {latest}</span> : "."}
        </span>
      </p>
    );
  }
  if (agent.status === "failed") {
    return (
      <p className={row}>
        <Bloom size={16} className={cx(mark, "text-text-3")} />
        <span>
          Rebloom couldn&apos;t draft this one.{" "}
          <button type="button" disabled={busy} onClick={onRetry} className={link}>
            Try again
          </button>
        </span>
      </p>
    );
  }
  if (agent.status !== "ready" || !inComposer) return null;
  return (
    <div className={row}>
      <Bloom size={16} unfurl className={cx(mark, "text-[#9e4a5d]")} />
      <div>
        <p>
          <span className="text-ink">Drafted by Rebloom.</span> Read it, change anything, then send.{" "}
          <span className="whitespace-nowrap">
            <button type="button" onClick={onHow} aria-expanded={how} aria-controls={stepsId} className={link}>
              How it was written
            </button>
            <span aria-hidden className="mx-2 text-text-3/60">·</span>
            <button type="button" disabled={busy} onClick={onClear} className={link}>
              Clear
            </button>
          </span>
        </p>
        {agent.note && <p className="mt-1.5 text-text-2">Before you send: {agent.note}</p>}
        {how && (
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

const LINK = /(https?:\/\/\S+)/g;

/** Links read as links; nothing else in a message is markup. */
function Words({ text, onDark }: { text: string; onDark: boolean }) {
  return (
    <>
      {text.split(LINK).map((part, i) =>
        i % 2 === 1 ? (
          <span key={i} className={cx("break-all underline underline-offset-2", onDark ? "text-[#bfe0ee] decoration-white/30" : "text-[#1e5a78] decoration-[#1e5a78]/40")}>
            {part}
          </span>
        ) : (
          part
        ),
      )}
    </>
  );
}

function Entry({ entry, firstName, arriving }: { entry: ConversationEntry; firstName: string; arriving: boolean }) {
  const [open, setOpen] = useState(false);
  const how = entry.channel === "sms" ? "Text" : "Email";

  if (entry.side === "note") {
    return (
      <li className={cx("flex items-center gap-4 text-[0.8125rem] text-text-3", arriving && "focus-in")}>
        <span aria-hidden className="h-px flex-1 bg-[#0c1a22]/[0.08]" />
        <span>
          {entry.body} · {entry.when}
        </span>
        <span aria-hidden className="h-px flex-1 bg-[#0c1a22]/[0.08]" />
      </li>
    );
  }

  const fromClient = entry.side === "client";
  // Long emails open on their first lines.
  const long = entry.channel === "email" && (entry.body.length > 420 || entry.body.split("\n").length > 8);
  const status =
    entry.status === "failed" ? "Didn't go through" : fromClient ? null : entry.logged ? "Logged" : "Sent";
  const ChannelIcon = entry.channel === "sms" ? IconMessage : IconMail;
  // Three voices, three finishes: the client on white, what Dana wrote in deep sea, what went out on its own in frost.
  const quiet = fromClient || entry.automatic;

  return (
    <li className={cx("flex items-end gap-3", fromClient ? "justify-start" : "justify-end", arriving && "focus-in")}>
      {fromClient && (
        <span
          aria-hidden
          className="mt-0.5 grid h-9 w-9 shrink-0 self-start place-items-center rounded-full bg-[linear-gradient(150deg,#1b3a4e_0%,#0b1a24_100%)] font-display text-[1rem] text-[#e2c07a] shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_8px_16px_-10px_rgba(12,44,62,0.7)]"
        >
          {firstName[0]}
        </span>
      )}
      <div className={cx("flex min-w-0 max-w-[min(36rem,88%)] flex-col", fromClient ? "items-start" : "items-end")}>
        <div
          className={cx(
            "relative px-5 py-3.5 text-[0.9375rem] leading-[1.6]",
            entry.channel === "sms" ? "rounded-[22px]" : "rounded-[18px]",
            fromClient
              ? "rounded-bl-[6px] bg-white text-ink shadow-[0_16px_32px_-22px_rgba(12,44,62,0.5)] ring-1 ring-inset ring-[#0c1a22]/[0.06]"
              : entry.automatic
                ? "rounded-br-[6px] bg-[linear-gradient(180deg,rgba(240,247,250,0.95),rgba(225,237,243,0.9))] text-text-2 ring-1 ring-inset ring-[#1e5a78]/10"
                : "sea on-dark rounded-br-[6px] text-[#eaf3f6] shadow-[0_18px_36px_-24px_rgba(12,26,34,0.75)]",
            entry.waiting && "!ring-2 !ring-[#f49543]/70 shadow-[0_0_0_6px_rgba(244,149,67,0.12),0_16px_32px_-22px_rgba(12,44,62,0.5)]",
          )}
        >
          {(entry.automatic || (entry.channel === "email" && entry.subject)) && (
            <p className={cx("mb-1.5 flex flex-wrap items-center gap-x-2 text-[0.8125rem] tracking-[0.01em]", quiet ? "text-text-3" : "text-ink-soft")}>
              {entry.automatic && (
                <span className="rounded-full bg-white/80 px-2 py-px text-[0.75rem] font-medium uppercase tracking-[0.1em] text-[#1e5a78] ring-1 ring-inset ring-[#1e5a78]/15">
                  Automatic
                </span>
              )}
              {entry.channel === "email" && entry.subject && <span className="min-w-0">{entry.subject}</span>}
            </p>
          )}
          <p className={cx("whitespace-pre-wrap [overflow-wrap:anywhere]", long && !open && "line-clamp-6")}>
            <Words text={entry.body} onDark={!quiet} />
          </p>
          {long && (
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              aria-expanded={open}
              className={cx("mt-2 text-[0.8125rem] underline underline-offset-4", quiet ? "text-text-3 decoration-[#0c1a22]/20 hover:text-ink" : "text-ink-soft decoration-white/25 hover:text-white")}
            >
              {open ? "Show less" : "Read all"}
            </button>
          )}
        </div>
        <p className={cx("mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5 px-1 text-[0.8125rem] text-text-3", !fromClient && "justify-end")}>
          {entry.waiting && (
            <span className="signal signal-urgent signal-live h-6 px-2.5 text-[0.75rem]">
              <span aria-hidden className="signal-dot" />
              Waiting on you · {entry.waiting}
            </span>
          )}
          <span className="inline-flex items-center gap-1.5">
            <ChannelIcon width={13} height={13} aria-hidden className="shrink-0 opacity-70" />
            {fromClient ? `${firstName} · ` : ""}
            {how} · {entry.when}
            {status ? ` · ${status}` : ""}
          </span>
          {entry.sender && <span>· from {entry.sender}</span>}
        </p>
      </div>
    </li>
  );
}
