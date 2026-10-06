"use client";

import { useId, useState } from "react";

const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const digits = (v: string, max: number) => v.replace(/\D/g, "").replace(/^0+(?=\d)/, "").slice(0, max);

/**
 * What one more visit is worth, in the visitor's own figures. Plain arithmetic, said as one sentence:
 * new clients a month, times the share who come back for one more session, times its price.
 */
export function Calculator({ price: defaultPrice }: { price: number }) {
  const id = useId();
  const [clients, setClients] = useState("40");
  const [price, setPrice] = useState(String(defaultPrice));
  const [share, setShare] = useState("10");
  const monthly = (Number(clients) || 0) * (Math.min(Number(share) || 0, 100) / 100) * (Number(price) || 0);

  return (
    <div>
      <p className="mb-5 text-[13.5px] font-normal text-text-3">Example figures. Tap any number to make it yours.</p>
      <p className="font-display text-[clamp(26px,2.6vw,36px)] font-light leading-[1.5] text-ink">
        You see{" "}
        <Field id={`${id}-clients`} label="New clients a month" value={clients} onChange={(v) => setClients(digits(v, 4))} fallback="40" />{" "}
        new clients a month, and a session is{" "}
        <span className="whitespace-nowrap">
          <Field id={`${id}-price`} label="Price of one session, in dollars" prefix="$" value={price} onChange={(v) => setPrice(digits(v, 5))} fallback={String(defaultPrice)} />.
        </span>{" "}
        If{" "}
        <Field
          id={`${id}-share`}
          label="Share who come back for one more session, in percent"
          suffix="%"
          value={share}
          onChange={(v) => setShare(digits(v, 3))}
          fallback="10"
          clamp={100}
        />{" "}
        more of them came back for one more visit, that&apos;s
      </p>

      <output htmlFor={`${id}-clients ${id}-price ${id}-share`} aria-live="polite" className="mt-8 block border-t border-[#0c1a22]/10 pt-8">
        <span className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
          <span className="gold-foil font-display text-[clamp(56px,6.4vw,88px)] font-light leading-none tracking-[-0.03em]">{money(monthly)}</span>
          <span className="text-[17px] text-text-2">a month</span>
        </span>
        <span className="mt-3 block font-display text-[clamp(24px,2.4vw,30px)] font-light text-ink">
          {money(monthly * 12)} <span className="font-sans text-[15px] text-text-2">a year</span>
        </span>
      </output>
      <p className="t-caption mt-6 max-w-[34rem] !text-[13px]">
        Simple arithmetic on your own figures, not a forecast. It counts one extra visit per client, nothing more.
      </p>
    </div>
  );
}

/** A number written into the sentence: underlined in gold, as wide as what's typed. */
function Field({
  id,
  label,
  value,
  onChange,
  fallback,
  prefix,
  suffix,
  clamp,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  fallback: string;
  prefix?: string;
  suffix?: string;
  clamp?: number;
}) {
  return (
    <label className="inline-flex cursor-text items-baseline whitespace-nowrap rounded-t-[6px] border-b-2 border-[#c99645]/60 bg-[#c99645]/[0.07] px-1 transition-colors duration-200 focus-within:border-[#9a6b22] focus-within:bg-[#c99645]/[0.14] hover:border-[#9a6b22]/80 hover:bg-[#c99645]/[0.12] has-[:focus-visible]:outline has-[:focus-visible]:outline-1 has-[:focus-visible]:outline-offset-4 has-[:focus-visible]:outline-ink">
      <span className="sr-only">{label}</span>
      {prefix && <span aria-hidden>{prefix}</span>}
      <input
        id={id}
        inputMode="numeric"
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => {
          if (!value) onChange(fallback);
          else if (clamp && Number(value) > clamp) onChange(String(clamp));
        }}
        style={{ width: `${Math.max(value.length, 1) + 0.35}ch` }}
        className="min-w-[1ch] bg-transparent text-center font-display text-[1em] font-normal text-ink [font-variant-numeric:lining-nums_tabular-nums] focus-visible:outline-none"
      />
      {suffix && <span aria-hidden>{suffix}</span>}
    </label>
  );
}
