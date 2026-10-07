// The booking emails (brief 3.1 step 8, DECISIONS D-065): a confirmation with a calendar invite when a visit is
// booked, and a short note when it's cancelled. Same frame as every other email from the clinic (D-053): the clinic's
// name on top, the report link as the gold button, Rebloom as the small line at the end. Pure, so it's testable.

import type { Clinic } from "@/lib/domain";
import { oneLine } from "./report";
import { rebookEmail, type RebookEmail } from "./rebook";

export interface BookingDetails {
  clinic: Clinic;
  firstName: string;
  treatmentName: string;
  startsAt: string;
  endsAt: string;
  /** Deposit taken, in cents. 0 when none was taken. */
  depositCents: number;
  /** The client's report link: where they see the visit, and cancel it. */
  reportUrl: string;
  /** Hours before the visit a client can still cancel online for a full refund. */
  noticeHours: number;
}

const dollars = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

/** "Tuesday, October 14 at 11:00 AM" in the clinic's time zone. */
export function visitWhen(startsAt: string, timeZone: string): string {
  const day = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", timeZone }).format(new Date(startsAt));
  const time = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit", timeZone }).format(new Date(startsAt));
  return `${day} at ${time}`;
}

const minutesBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 60_000);

export function bookingConfirmationEmail(d: BookingDetails): RebookEmail {
  const name = oneLine(d.firstName);
  const when = visitWhen(d.startsAt, d.clinic.timezone);
  const deposit =
    d.depositCents > 0
      ? `Your ${dollars(d.depositCents)} deposit is paid and goes toward the visit. If your plans change, cancel from your report up to ${d.noticeHours} hours before and it comes back to you in full.`
      : `If your plans change, cancel from your report up to ${d.noticeHours} hours before.`;
  const body = [
    `Hi ${name},`,
    `You're booked for ${d.treatmentName} on ${when}. It takes about ${minutesBetween(d.startsAt, d.endsAt)} minutes. The calendar invite is attached.`,
    deposit,
    d.reportUrl,
    `We're at ${d.clinic.address}. Questions before then? Call us on ${d.clinic.phone}.`,
  ].join("\n\n");
  return rebookEmail({ clinic: d.clinic, subject: `You're booked, ${name}`, body });
}

export function bookingCancelledEmail(d: BookingDetails & { refunded: boolean }): RebookEmail {
  const name = oneLine(d.firstName);
  const when = visitWhen(d.startsAt, d.clinic.timezone);
  const money = d.refunded ? ` Your ${dollars(d.depositCents)} deposit is on its way back to you. Refunds usually show within 5 to 10 days.` : "";
  const body = [
    `Hi ${name},`,
    `Your visit for ${d.treatmentName} on ${when} is cancelled.${money}`,
    "Your report keeps your plan, so you can book a new time from it whenever you're ready.",
    d.reportUrl,
  ].join("\n\n");
  return rebookEmail({ clinic: d.clinic, subject: `Your visit is cancelled`, body });
}

const icsStamp = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
/** RFC 5545 text: commas, semicolons and backslashes escaped, line breaks as \n. */
const icsText = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
/** Lines longer than 75 octets are folded onto continuation lines. */
const fold = (line: string) => line.match(/.{1,73}/g)!.join("\r\n ");

/** A calendar invite for the visit. `uid` stays the same for one visit, so a cancellation replaces it. */
export function visitInvite(input: {
  uid: string;
  clinic: Pick<Clinic, "name" | "address" | "phone">;
  treatmentName: string;
  startsAt: string;
  endsAt: string;
  reportUrl: string;
  now: Date;
  cancelled?: boolean;
}): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Rebloom//Booking//EN",
    `METHOD:${input.cancelled ? "CANCEL" : "PUBLISH"}`,
    "BEGIN:VEVENT",
    `UID:${input.uid}@rebloom`,
    `DTSTAMP:${icsStamp(input.now.toISOString())}`,
    `DTSTART:${icsStamp(input.startsAt)}`,
    `DTEND:${icsStamp(input.endsAt)}`,
    `SUMMARY:${icsText(`${input.treatmentName} · ${input.clinic.name}`)}`,
    `LOCATION:${icsText(input.clinic.address)}`,
    `DESCRIPTION:${icsText(`Your report: ${input.reportUrl}\nQuestions? Call ${input.clinic.phone}.`)}`,
    `STATUS:${input.cancelled ? "CANCELLED" : "CONFIRMED"}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}
