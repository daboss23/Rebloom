// What to change when Resend says no, in plain words. Shared by the setup check and the demo copy.

/** Plain-words next steps for the errors Resend gives most often. */
export function hintFor(message: string): string | undefined {
  if (/only send testing emails to your own email/i.test(message)) {
    return "Resend's test sender only delivers to the address that owns the Resend account. Send to that address, or verify a domain in Resend and set EMAIL_FROM to an address on it.";
  }
  if (/domain is not verified|verify a domain/i.test(message)) {
    return "EMAIL_FROM uses a domain Resend hasn't verified yet. Finish the DNS records in Resend, Domains, or remove EMAIL_FROM to use the test sender.";
  }
  if (/api key is invalid|missing api key|restricted/i.test(message)) {
    return "RESEND_API_KEY isn't a working sending key. Create a new key in Resend with sending access and update it in Vercel.";
  }
  return undefined;
}
