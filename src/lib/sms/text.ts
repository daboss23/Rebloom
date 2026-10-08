// Texts (DECISIONS D-080): US phone numbers and message length. Pure, so the browser, the engine and tests share it.

/**
 * A US number in the form carriers want, "+13105550142", or null when it can't be one. Takes what people type:
 * "(310) 555-0142", "310.555.0142", "+1 310 555 0142". Area codes and exchanges never start with 0 or 1.
 */
export function toUsE164(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let digits = raw.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
  if (!/^[2-9]\d{2}[2-9]\d{6}$/.test(digits)) return null;
  return `+1${digits}`;
}

/** "+13105550142" to "(310) 555-0142", for showing a number back. */
export function formatUsPhone(e164: string): string {
  const d = e164.replace(/^\+1/, "");
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

/** Every text ends with this, so the way out is always in the message itself (D-080). */
export const TEXT_OPT_OUT = "Reply STOP to opt out.";

/** Longest text the dashboard will send: four parts. Rebook texts are written to fit in two. */
export const TEXT_MAX_CHARS = 640;

// The GSM 03.38 alphabet: texts written only in it fit 160 characters a part. Anything else (an emoji, a curly
// quote) switches the whole message to 70 a part.
const GSM = new Set(
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà",
);
const GSM_EXTENDED = new Set("^{}\\[~]|€");

/** How many parts a text is sent in, and in which alphabet. Phones show it as one message either way. */
export function textParts(text: string): { parts: number; unicode: boolean } {
  let units = 0;
  let unicode = false;
  for (const ch of text) {
    if (GSM.has(ch)) units += 1;
    else if (GSM_EXTENDED.has(ch)) units += 2;
    else {
      unicode = true;
      break;
    }
  }
  if (unicode) {
    const length = [...text].reduce((n, ch) => n + (ch.codePointAt(0)! > 0xffff ? 2 : 1), 0);
    return { parts: length <= 70 ? 1 : Math.ceil(length / 67), unicode };
  }
  return { parts: units <= 160 ? 1 : Math.ceil(units / 153), unicode };
}
