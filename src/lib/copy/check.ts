// Copy rules (brief 7.7), enforced in code for AI-written text (brief 8.3) and checked across UI copy.
// Phrase patterns with word boundaries, plus an allowlist for fixed legal text (DECISIONS D-012).

const BANNED: [string, RegExp][] = [
  ["glow up", /\bglow[\s-]?up\b/i],
  ["flawless", /\bflawless\b/i],
  ["perfect skin", /\bperfect skin\b/i],
  ["miracle", /\bmiracles?\b/i],
  ["transform your life", /\btransform your life\b/i],
  ["anti-aging secret", /\banti[\s-]?aging secrets?\b/i],
  ["diagnose", /\bdiagnos(e|es|ed|ing|is|es)\b/i],
  ["cure", /\bcur(e|es|ed|ing)\b/i],
  ["treat a condition", /\btreat(s|ed|ing)?\s+(your\s+|the\s+|a\s+)?(acne|rosacea|eczema|psoriasis|melasma|dermatitis|condition|disease)\b/i],
  ["guaranteed", /\bguarantee(d|s)?\b/i],
  ["problem skin", /\bproblem skin\b/i],
  ["flaws", /\bflaws?\b/i],
  ["imperfections", /\bimperfections?\b/i],
  ["fix your face", /\bfix your face\b/i],
  ["Botox", /\bbotox\b/i],
  ["HydraFacial", /\bhydra\s?facial\b/i],
];

/** Fixed sentences that are allowed to contain otherwise-banned words. */
const ALLOWLIST = [
  /not a medical diagnosis/gi,
  /not a guaranteed result/gi,
  /never a guarantee/gi,
];

export interface CopyIssue {
  rule: string;
  match: string;
}

export function checkCopy(text: string): CopyIssue[] {
  const issues: CopyIssue[] = [];
  if (text.includes("\u2014")) issues.push({ rule: "em dash", match: "\u2014" });
  const scrubbed = ALLOWLIST.reduce((t, re) => t.replace(re, " "), text);
  for (const [rule, re] of BANNED) {
    const m = scrubbed.match(re);
    if (m) issues.push({ rule, match: m[0] });
  }
  return issues;
}

/** Replaces em dashes with a full stop or comma, as the brief asks. */
export function stripEmDashes(text: string): string {
  return text.replace(/\s*\u2014\s*/g, ", ");
}
