"use client";

import { useState, useTransition } from "react";
import { saveNote } from "@/app/dashboard/actions";

/** Dana's note. It appears on the client's report, so it's written to the client. */
export function NoteEditor({ clientId, initial, author }: { clientId: string; initial: string | null; author: string }) {
  const [note, setNote] = useState(initial ?? "");
  const [saved, setSaved] = useState(initial ?? "");
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const dirty = note.trim() !== saved.trim();

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const result = await saveNote({ clientId, note });
          setStatus({ ok: result.ok, text: result.ok ? (result.message ?? "Saved.") : (result.error ?? "Couldn't save.") });
          if (result.ok) setSaved(note);
        });
      }}
    >
      <label className="block">
        <span className="t-label">Your note on their report</span>
        <textarea
          value={note}
          onChange={(e) => {
            setNote(e.target.value);
            setStatus(null);
          }}
          rows={4}
          placeholder="A line or two, in your own words, for their report."
          className="mt-3 w-full resize-y border-0 border-l border-mist bg-transparent py-1 pl-4 font-display text-[21px] leading-snug text-ink outline-none transition-colors duration-200 placeholder:text-text-3 focus:border-ink"
        />
      </label>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 pl-4">
        <span className="t-caption !text-[12.5px]">{author}</span>
        <span className="flex items-center gap-4">
          <span role="status" className="t-caption !text-[12.5px]">
            {status?.text}
          </span>
          <button
            type="submit"
            disabled={!dirty || pending}
            className="h-9 border border-ink px-4 text-[13px] text-ink transition-[background-color,color,opacity,transform] duration-200 ease-out hover:bg-ink hover:text-porcelain active:scale-[0.97] disabled:border-mist disabled:text-text-3 disabled:hover:bg-transparent"
          >
            {pending ? "Saving" : "Save note"}
          </button>
        </span>
      </div>
    </form>
  );
}
