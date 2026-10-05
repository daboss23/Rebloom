"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { FieldLabel, TextInput } from "@/components/ui/Field";
import { IconAlert, IconCheckCircle } from "@/components/ui/Icons";

/** What /api/youcam/check answers. */
interface CheckResult {
  connected: boolean;
  liveScans: boolean;
  unitsInAccount?: number | null;
  problem?: string;
  budget: { units: number; remainingByOurLog: number; reserve: number };
}

type State =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "done"; result: CheckResult }
  | { kind: "error"; message: string };

const number = (n: number) => n.toLocaleString("en-US");

export function YouCamCheck() {
  const [secret, setSecret] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });

  async function check(event: FormEvent) {
    event.preventDefault();
    setState({ kind: "checking" });
    try {
      // In a header, never the URL, so the password stays out of logs and browser history.
      const res = await fetch("/api/youcam/check", {
        headers: { authorization: `Bearer ${secret.trim()}` },
        cache: "no-store",
      });
      if (res.status === 404) {
        setState({ kind: "error", message: "That password doesn't match CRON_SECRET on this site. Copy it again from Vercel and try once more." });
        return;
      }
      if (!res.ok) throw new Error(String(res.status));
      setState({ kind: "done", result: (await res.json()) as CheckResult });
    } catch {
      setState({ kind: "error", message: "Couldn't reach this site's server. Check your connection and try again." });
    }
  }

  return (
    <div className="mt-10">
      <form onSubmit={check}>
        <FieldLabel htmlFor="cron-secret">Password (CRON_SECRET)</FieldLabel>
        <TextInput
          id="cron-secret"
          type="password"
          autoComplete="off"
          spellCheck={false}
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
        />
        <Button type="submit" block className="mt-6" disabled={state.kind === "checking"}>
          {state.kind === "checking" ? "Checking" : "Check connection"}
        </Button>
      </form>

      <div aria-live="polite" className="mt-10">
        {state.kind === "error" && <Outcome ok={false} title="Not checked.">{state.message}</Outcome>}
        {state.kind === "done" && <Result result={state.result} />}
      </div>
    </div>
  );
}

function Result({ result }: { result: CheckResult }) {
  const { budget } = result;
  const ledger = (
    <Row label="Units left by our own count">
      {number(budget.remainingByOurLog)} of {number(budget.units)}, with {number(budget.reserve)} kept in reserve
    </Row>
  );
  if (!result.connected) {
    return (
      <Outcome ok={false} title="Not connected.">
        {result.problem ?? "YouCam didn't accept the connection."}
        <dl className="mt-6">{ledger}</dl>
      </Outcome>
    );
  }
  return (
    <Outcome ok title="Connected to YouCam.">
      <dl className="mt-6">
        <Row label="Units in your YouCam account">
          {typeof result.unitsInAccount === "number" ? number(result.unitsInAccount) : "Connected, but the balance couldn't be read"}
        </Row>
        <Row label="Live scans">
          {result.liveScans ? "On. Scans use YouCam." : "Off. Set YOUCAM_MODE to live in Vercel, then redeploy."}
        </Row>
        {ledger}
      </dl>
    </Outcome>
  );
}

function Outcome({ ok, title, children }: { ok: boolean; title: string; children: ReactNode }) {
  const Icon = ok ? IconCheckCircle : IconAlert;
  return (
    <section className="border-t border-mist pt-8 reveal">
      <Icon width={26} height={26} className={ok ? "text-bronze" : "text-ink"} />
      <h2 className="t-h2 mt-4">{title}</h2>
      <div className="t-body mt-3">{children}</div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="border-t border-mist py-4">
      <dt className="t-label">{label}</dt>
      <dd className="mt-1 text-[15px] text-ink">{children}</dd>
    </div>
  );
}
