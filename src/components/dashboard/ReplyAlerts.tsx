"use client";

// Where reply alerts go (DECISIONS D-087): the clinic hears the moment a client writes back. An email address, a US
// mobile, either or both. Clearing a field turns that one off.

import { useId, useState, useTransition } from "react";
import { setReplyAlerts } from "@/app/dashboard/actions";
import { cx } from "@/components/ui/cx";

const field =
  "mt-2 h-12 w-full rounded-[14px] border border-[#0c1a22]/10 bg-white/85 px-4 text-[0.9375rem] text-ink outline-none transition-[border-color,box-shadow] duration-200 placeholder:text-text-3 focus:border-[#1e5a78]/50 focus:shadow-[0_0_0_4px_rgba(159,201,221,0.35)] aria-invalid:border-[#b8691f]/60";

export function ReplyAlerts({ email, phone, textsLive }: { email: string | null; phone: string | null; textsLive: boolean }) {
  const [values, setValues] = useState({ email: email ?? "", phone: phone ?? "" });
  const [saved, setSaved] = useState(values);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const id = useId();
  const changed = values.email.trim() !== saved.email.trim() || values.phone.trim() !== saved.phone.trim();

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const result = await setReplyAlerts(values);
          setStatus({ ok: result.ok, text: result.ok ? (result.message ?? "Saved.") : (result.error ?? "That didn't save. Please try again.") });
          if (result.ok) setSaved(values);
        });
      }}
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <label className="block" htmlFor={`${id}-email`}>
          <span className="t-label">Email alerts to</span>
          <input
            id={`${id}-email`}
            type="email"
            autoComplete="email"
            inputMode="email"
            value={values.email}
            onChange={(e) => setValues((v) => ({ ...v, email: e.target.value }))}
            placeholder="you@yourclinic.com"
            aria-invalid={status && !status.ok && /email/i.test(status.text) ? true : undefined}
            className={field}
          />
        </label>
        <label className="block" htmlFor={`${id}-phone`}>
          <span className="t-label">Text alerts to</span>
          <input
            id={`${id}-phone`}
            type="tel"
            autoComplete="tel"
            value={values.phone}
            onChange={(e) => setValues((v) => ({ ...v, phone: e.target.value }))}
            placeholder="(310) 555-0142"
            aria-describedby={`${id}-phone-help`}
            aria-invalid={status && !status.ok && /mobile/i.test(status.text) ? true : undefined}
            className={field}
          />
          <span id={`${id}-phone-help`} className="t-caption mt-2 block !text-[0.78125rem]">
            {textsLive ? "A US mobile. Optional." : "Texts need Twilio connected. A number saved now is used once it is."}
          </span>
        </label>
      </div>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <p role="status" aria-live="polite" className={cx("min-h-[1.25em] text-[0.8125rem]", status?.ok === false ? "text-ink" : "text-[#1e5a78]")}>
          {status?.text}
        </p>
        <button type="submit" disabled={pending || !changed} className="btn-sea !h-11 min-w-32 px-6 disabled:opacity-40 disabled:saturate-0">
          {pending ? "Saving" : "Save"}
        </button>
      </div>
    </form>
  );
}
