// Reading a reply (DECISIONS D-081): only the client's new words, without the quoted thread or the phone's sign-off.
// Pure, so the webhooks, the demo seed and the tests share it.

/** Longest reply kept. Anything past it is almost always a forwarded thread. */
export const REPLY_MAX_CHARS = 4000;

// The line an email app writes above the message being replied to. Everything from it down is old.
// Gmail, Apple Mail: "On Tue, Oct 6, 2026 at 9:14 AM Maison Verre <hello@…> wrote:", sometimes wrapped onto two lines.
const ON_WROTE = /^On\s.{4,300}\swrote:\s*$/i;
// Outlook's "-----Original Message-----", its rule of underscores, and Apple Mail's forward.
const DIVIDERS = [/^-{3,}\s*Original Message\s*-{3,}\s*$/i, /^_{10,}\s*$/, /^Begin forwarded message:\s*$/i];
// A "From:" line starts a quoted block only when the next line carries the rest of its header.
const FROM = /^\*?From:\*?\s/i;
const HEADER_FOLLOW = /^\*?(Sent|Date|To|Subject|Cc):\*?\s/i;
// The sign-offs phones and apps add on their own.
const SIGN_OFFS = [/^Sent from my \w+/i, /^Sent from (Yahoo|Outlook|Mail)\b/i, /^Get Outlook for /i, /^Sent via /i];

/**
 * The new words in an email reply: stops at the quoted message, drops ">" lines, a "-- " signature and the phone's
 * sign-off.
 */
export function stripQuoted(text: string): string {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const quoteStarts = (i: number) => {
    const line = lines[i].trim();
    const next = lines[i + 1]?.trim() ?? "";
    if (FROM.test(line)) return HEADER_FOLLOW.test(next);
    if (/^On\s/i.test(line)) return ON_WROTE.test(line) || ON_WROTE.test(`${line} ${next}`);
    // RFC 3676's signature line, "-- ", often trimmed to "--".
    return line === "--" || DIVIDERS.some((re) => re.test(line));
  };
  const kept: string[] = [];
  for (let i = 0; i < lines.length && !quoteStarts(i); i++) {
    if (!lines[i].trim().startsWith(">")) kept.push(lines[i].replace(/\s+$/, ""));
  }
  const last = () => kept[kept.length - 1].trim();
  while (kept.length && (last() === "" || SIGN_OFFS.some((re) => re.test(last())))) kept.pop();
  return kept
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, REPLY_MAX_CHARS);
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'" };

/** Plain text from an HTML-only email: quoted blocks dropped, line breaks kept, tags and entities gone. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(head|style|script)[\s\S]*?<\/\1>/gi, "")
    .replace(/<blockquote[\s\S]*<\/blockquote>/gi, "")
    .replace(/<div[^>]+class="[^"]*gmail_quote[\s\S]*$/i, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&(#\d+|#x[\da-f]+|\w+);/gi, (match, name: string) => {
      if (name.startsWith("#x")) return String.fromCodePoint(parseInt(name.slice(2), 16));
      if (/^#\d+$/.test(name)) return String.fromCodePoint(Number(name.slice(1)));
      return ENTITIES[name.toLowerCase()] ?? match;
    })
    .replace(/[ \t]+\n/g, "\n");
}

/** "Sofia Morales <Sofia@Example.com>" to "sofia@example.com". Null when there's no address in it. */
export function addressOf(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const match = raw.match(/<([^<>\s]+@[^<>\s]+)>/) ?? raw.match(/([^\s<>"',;]+@[^\s<>"',;]+)/);
  return match ? match[1].toLowerCase() : null;
}

// Twilio's own keywords: a text that is only one of these opts the number out of, or back into, the clinic's texts.
const OPT_OUT = new Set(["STOP", "STOPALL", "STOP ALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT", "OPTOUT", "REVOKE"]);
const OPT_IN = new Set(["START", "UNSTOP", "YES"]);

/** "stop" or "start" when a text is only one of the carrier keywords, as Twilio reads them; null otherwise. */
export function optKeyword(body: string): "stop" | "start" | null {
  const word = body.trim().replace(/[.!]+$/, "").replace(/\s+/g, " ").toUpperCase();
  if (OPT_OUT.has(word)) return "stop";
  if (OPT_IN.has(word)) return "start";
  return null;
}

/**
 * An out-of-office or other automatic answer, or a bounce: not something the client wrote, so it never waits on Dana.
 * Read from the headers RFC 3834 and the common mail servers set, and the subjects they use.
 */
export function isAutomatic({ headers, from, subject }: { headers: Record<string, string> | null; from: string; subject: string | null }): boolean {
  const h = Object.fromEntries(Object.entries(headers ?? {}).map(([k, v]) => [k.toLowerCase(), String(v).toLowerCase()]));
  if (h["auto-submitted"] && h["auto-submitted"] !== "no") return true;
  if ("x-autoreply" in h || "x-autorespond" in h || "x-auto-response-suppress" in h) return true;
  if (["bulk", "junk", "list", "auto_reply"].includes(h["precedence"] ?? "")) return true;
  if (/^(mailer-daemon|postmaster)@/i.test(addressOf(from) ?? "")) return true;
  return /^(automatic reply|auto(matic)?[- ]?reply|out of (the )?office|undeliverable|delivery status notification)\b/i.test((subject ?? "").trim());
}
