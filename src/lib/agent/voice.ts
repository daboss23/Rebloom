// How the agent's drafts should sound (DECISIONS D-093): like Dana, not like software. Two things live here. The
// phrases that give machine writing away, checked in code on every draft, so a draft that slips is sent back to be
// rewritten rather than trusted to the prompt. And the examples of Dana's own writing each run reads (part 4): her
// answers, and the drafts she changed before sending, with what she sent instead. Pure, so tests share it.

import type { AgentDraft, Message } from "@/lib/domain";
import { ANSWER_TYPE } from "@/lib/replies/thread";

/** Phrases that read as written by a machine or a marketing team. Each one sends the draft back to be rewritten. */
const TELLS: [string, RegExp][] = [
  ["I hope this finds you well", /\bhope (this|the|my) (message|email|note|text)? ?finds you\b/i],
  ["I hope this helps", /\bhope (this|that) helps\b/i],
  ["Great question", /\b(great|good|excellent|fantastic) question\b/i],
  ["I completely understand", /\bI (completely|totally|fully|absolutely) understand\b/i],
  ["Rest assured", /\brest assured\b/i],
  ["Don't hesitate", /\b(don'?t|do not) hesitate\b/i],
  ["Reach out", /\breach out\b/i],
  ["Feel free", /\bfeel free\b/i],
  ["At your earliest convenience", /\bat your earliest convenience\b/i],
  ["Journey", /\bjourneys?\b/i],
  ["Delve", /\bdelv(e|es|ing)\b/i],
  ["Elevate", /\belevat(e|es|ed|ing)\b/i],
  ["Embark", /\bembark/i],
  ["Unlock", /\bunlock/i],
  ["Seamless", /\bseamless(ly)?\b/i],
  ["Pamper", /\bpamper/i],
  ["Tailored to your needs", /\btailored to (your|you)\b/i],
  ["Thrilled or excited", /\b(I'?m|I am|we'?re|we are) (so |really |truly )?(thrilled|excited|delighted)\b/i],
  ["As an AI", /\bas an (AI|assistant|language model)\b/i],
];

export interface VoiceIssue {
  rule: string;
  match: string;
}

// Emoji and pictographs: the brief allows none anywhere.
const EMOJI = /\p{Extended_Pictographic}/u;

/**
 * What gives a draft away as machine-written: the phrases above, more than one exclamation mark, emoji, and the
 * formatting a person doesn't put in a text or a short email (bullets, headings, bold).
 */
export function checkVoice(text: string): VoiceIssue[] {
  const issues: VoiceIssue[] = [];
  for (const [rule, re] of TELLS) {
    const m = text.match(re);
    if (m) issues.push({ rule, match: m[0].trim() });
  }
  const bangs = text.match(/!/g)?.length ?? 0;
  if (bangs > 1) issues.push({ rule: "More than one exclamation mark", match: "!" });
  const emoji = text.match(EMOJI);
  if (emoji) issues.push({ rule: "Emoji", match: emoji[0] });
  if (/^\s*([-*•]|\d+[.)])\s+/m.test(text)) issues.push({ rule: "A list", match: "bullet points" });
  if (/\*\*|__|^#+\s/m.test(text)) issues.push({ rule: "Formatting", match: "bold or a heading" });
  return issues;
}

/** Straight quotes and apostrophes: a curly one makes every part of a text shorter (D-080), and none is needed. */
export function plainPunctuation(text: string): string {
  return text
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, "...")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

export interface VoiceExamples {
  /** What Dana wrote herself, newest first. */
  written: { channel: Message["channel"]; body: string }[];
  /** Drafts she changed before sending: what the agent wrote, and what she sent. Newest first. */
  edits: { draft: string; sent: string }[];
}

/** How many of each a run reads: enough to catch her voice, few enough to keep the prompt small. */
export const VOICE_LIMITS = { written: 4, edits: 3 } as const;


/**
 * Dana's own voice, from this book: answers she wrote to clients (never the automatic emails or the engine's
 * pre-written reminders), and the drafts she rewrote before sending. Sample clients count: in the demo, they are
 * the book.
 */
export function voiceExamples(messages: Message[], drafts: AgentDraft[]): VoiceExamples {
  const newest = <T,>(rows: T[], when: (r: T) => string) => [...rows].sort((a, b) => when(b).localeCompare(when(a)));
  // An answer that started as a draft is counted as an edit (or not at all, if sent unchanged), never twice.
  const squash = (t: string) => t.replace(/\s+/g, " ").trim().toLowerCase();
  const fromDrafts = new Set(drafts.filter((d) => d.status === "used" && d.sentBody).map((d) => squash(d.sentBody!)));
  const written = newest(
    messages.filter((m) => m.type === ANSWER_TYPE && m.status === "sent" && m.body.trim() && !fromDrafts.has(squash(m.body))),
    (m) => m.sentAt ?? m.createdAt,
  )
    .slice(0, VOICE_LIMITS.written)
    .map((m) => ({ channel: m.channel, body: m.body.trim() }));
  const edits = newest(
    // A draft sent as written teaches nothing new.
    drafts.filter((d) => d.status === "used" && d.body && d.sentBody && squash(d.body) !== squash(d.sentBody)),
    (d) => d.updatedAt,
  )
    .slice(0, VOICE_LIMITS.edits)
    .map((d) => ({ draft: d.body!.trim(), sent: d.sentBody!.trim() }));
  return { written, edits };
}
