"use client";

// A client's conversation with the clinic (DECISIONS D-081): what the clinic sent and what they wrote back, in order,
// and the place Dana answers from. Nothing reaches the client until she presses Send.

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { answerClient, markReplyHandled, undoDone } from "@/app/dashboard/actions";
import { cx } from "@/components/ui/cx";
import { IconMail, IconMessage } from "@/components/ui/Icons";
import { TEXT_MAX_CHARS, textParts } from "@/lib/sms/text";
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
  "w-full rounded-[14px] border border-[#0c1a22]/10 bg-white/85 text-ink outline-none transition-[border-color,box-shadow] duration-200 focus:border-[#1e5a78]/50 focus:shadow-[0_0_0_4px_rgba(159,201,221,0.35)]";

const nonce = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

export function Conversation({
  clientId,
  firstName,
  entries,
  channels,
  defaultChannel,
  email,
  phone,
  subject,
  waiting,
  demo,
}: {
  clientId: string;
  firstName: string;
  entries: ConversationEntry[];
  /** Which ways Dana can write back: email needs an address, text a yes (or their own text) and no STOP. */
  channels: { email: boolean; text: boolean };
  defaultChannel: Channel;
  email: string | null;
  /** Shown as typed: "(310) 555-0142". */
  phone: string | null;
  /** The subject an email answer goes under. */
  subject: string;
  waiting: boolean;
  demo: boolean;
}) {
  const [channel, setChannel] = useState<Channel>(defaultChannel);
  const [body, setBody] = useState("");
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
      const result = await answerClient({ clientId, channel, body, nonce: key.current });
      if (result.ok) {
        key.current = nonce();
        setBody("");
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
        <ol aria-label={`Conversation with ${firstName}`} className="mt-6 space-y-5">
          {hidden > 0 && (
            <li className="flex justify-center">
              <button
                type="button"
                onClick={() => setAll(true)}
                className="rounded-full bg-white/70 px-4 py-1.5 text-[12.5px] text-text-3 ring-1 ring-inset ring-[#0c1a22]/[0.06] transition-colors duration-150 hover:text-ink"
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
          className="mt-8 rounded-[20px] bg-white/55 p-4 ring-1 ring-inset ring-white sm:p-5"
        >
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
            <label htmlFor={`${countId}-body`} className="t-label">
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
              <span className="flex items-center gap-2 text-[13px] text-text-3">
                {isText ? <IconMessage width={15} height={15} /> : <IconMail width={15} height={15} />}
                {isText ? "By text" : "By email"}
              </span>
            )}
          </div>
          <p className="t-caption mt-3 !text-[12.5px]">
            {isText ? `To ${phone}` : `To ${email} · ${subject}`}
          </p>
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
            rows={isText ? 3 : 5}
            placeholder={isText ? `A short text to ${firstName}` : `Hi ${firstName},`}
            aria-describedby={isText ? countId : undefined}
            className={cx(field, "mt-3 resize-y p-4 text-[15px] leading-relaxed placeholder:text-text-3")}
          />
          {isText && (
            <p id={countId} aria-live="polite" className={cx("t-caption mt-2 !text-[12.5px]", tooLong && "!text-ink")}>
              {tooLong
                ? `${trimmed.length} characters. Keep it under ${TEXT_MAX_CHARS}.`
                : `${trimmed.length} characters${trimmed ? `, sent as ${parts === 1 ? "one text" : `${parts} parts`}` : ""}${unicode ? ". An emoji or curly quote makes each part shorter" : ""}.`}
            </p>
          )}
          {error && (
            <p role="alert" className="mt-3 text-[14px] text-ink">
              {error}
            </p>
          )}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
            <p className="t-caption !text-[12.5px]">
              {demo ? `Demo mode: logged here, not ${isText ? "texted" : "emailed"}.` : `${firstName}'s answer comes back here.`}
            </p>
            <div className="flex items-center gap-5">
              {waiting && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={handled}
                  className="whitespace-nowrap text-[13px] text-text-3 underline decoration-[#0c1a22]/20 underline-offset-4 transition-colors duration-150 hover:text-ink hover:decoration-ink"
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
        <p className="t-caption mt-6">There&apos;s no email address or mobile number to write to {firstName} at.</p>
      )}

      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
        {toast && (
          <div key={toast.id} className="toast sea on-dark pointer-events-auto flex max-w-md items-center gap-6 rounded-[14px] py-3.5 pl-5 pr-4 text-[13.5px] shadow-[0_24px_48px_-20px_rgba(12,26,34,0.6)]">
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
      <li className={cx("flex items-center gap-4 text-[12.5px] text-text-3", arriving && "focus-in")}>
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

  return (
    <li className={cx("flex flex-col", fromClient ? "items-start" : "items-end", arriving && "focus-in")}>
      <div
        className={cx(
          "relative max-w-[min(36rem,92%)] px-4 py-3 text-[15px] leading-[1.55]",
          entry.channel === "sms" ? "rounded-[20px]" : "rounded-[18px]",
          fromClient
            ? "rounded-bl-[6px] bg-white text-ink shadow-[0_14px_30px_-22px_rgba(12,44,62,0.45)] ring-1 ring-inset ring-[#0c1a22]/[0.05]"
            : entry.automatic
              ? "rounded-br-[6px] bg-[#e1edf2]/80 text-text-2 ring-1 ring-inset ring-white"
              : "sea on-dark rounded-br-[6px] text-[#eaf3f6] shadow-[0_18px_36px_-24px_rgba(12,26,34,0.75)]",
          entry.waiting && "ring-2 !ring-[#d9ae62]/70",
        )}
      >
        {entry.channel === "email" && entry.subject && (
          <p className={cx("mb-1.5 text-[12px] tracking-[0.01em]", fromClient || entry.automatic ? "text-text-3" : "text-ink-soft")}>{entry.subject}</p>
        )}
        <p className={cx("whitespace-pre-wrap break-words", long && !open && "line-clamp-6")}>
          <Words text={entry.body} onDark={!fromClient && !entry.automatic} />
        </p>
        {long && (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className={cx("mt-2 text-[12.5px] underline underline-offset-4", fromClient || entry.automatic ? "text-text-3 decoration-[#0c1a22]/20 hover:text-ink" : "text-ink-soft decoration-white/25 hover:text-white")}
          >
            {open ? "Show less" : "Read all"}
          </button>
        )}
      </div>
      <p className={cx("mt-1.5 flex flex-wrap items-center gap-x-2 px-1 text-[12px] text-text-3", !fromClient && "justify-end")}>
        {entry.waiting && (
          <span className="flex items-center gap-1.5 font-medium text-[#7a5014]">
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[#c99645]" />
            Waiting on you · {entry.waiting}
          </span>
        )}
        <span>
          {fromClient ? `${firstName} · ` : ""}
          {how} · {entry.when}
          {status ? ` · ${status}` : ""}
        </span>
        {entry.sender && <span>· from {entry.sender}</span>}
      </p>
    </li>
  );
}
