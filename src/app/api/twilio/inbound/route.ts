// A client's text back to the clinic's number, delivered by Twilio (DECISIONS D-081). Point the number's "A message
// comes in" webhook here. Twilio signs each request with the auth token. STOP and START are Twilio's to act on; they
// are kept so the dashboard knows, and answered with nothing.
import { env } from "@/lib/env";
import { REPLY_MAX_CHARS } from "@/lib/replies/parse";
import { clientForPhone, saveReply } from "@/lib/replies/receive";
import { json } from "@/lib/scans/access";
import { validTwilioSignature } from "@/lib/sms/twilio";

/** An empty TwiML answer: Twilio sends nothing back to the client. */
const nothing = () =>
  new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', { headers: { "content-type": "text/xml; charset=utf-8" } });

export async function POST(request: Request) {
  if (!env.TWILIO_AUTH_TOKEN) return json({ error: "Texts aren't set up." }, 503);
  const params = new URLSearchParams(await request.text());
  const url = new URL(request.url);
  // Twilio signs the address it was given, which is APP_URL's when the site sits behind a proxy.
  const urls = [request.url, ...(env.APP_URL ? [`${env.APP_URL.replace(/\/$/, "")}${url.pathname}${url.search}`] : [])];
  if (!validTwilioSignature(urls, params, request.headers.get("x-twilio-signature"))) return json({ error: "Signature doesn't match." }, 403);

  const sid = params.get("MessageSid") ?? params.get("SmsSid");
  const from = params.get("From");
  if (!sid || !from) return nothing();
  const client = await clientForPhone(from);
  if (!client) return nothing();
  const pictures = Number(params.get("NumMedia") ?? 0);
  const body = (params.get("Body") ?? "").trim().slice(0, REPLY_MAX_CHARS) || (pictures > 0 ? (pictures === 1 ? "Sent a picture. Pictures aren't shown here yet." : `Sent ${pictures} pictures. Pictures aren't shown here yet.`) : "");
  if (body) await saveReply(client, { channel: "sms", providerId: sid, sender: from, subject: null, body });
  return nothing();
}
