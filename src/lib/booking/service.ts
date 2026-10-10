import "server-only";
// Booking from a report link (brief 3.1 step 8, DECISIONS D-065). The report token is the only key, as for the report
// itself. Every date runs on the client's own sandbox clock, so a time-travelled demo books in its own future.
//
// A time is held the moment it's chosen: the visit is saved as booked with its deposit pending, so the database's
// no-overlap rule (D-049) keeps it while the client pays. Paid, it's confirmed. Abandoned, the hold lapses after
// HOLD_MINUTES and the time opens again. Without Stripe the visit is confirmed at once, with no deposit taken.

import type { Appointment, Client, Clinic, ISODate, Treatment } from "@/lib/domain";
import { env, features } from "@/lib/env";
import { isoDateInZone, sandboxClock, virtualNow } from "@/lib/clock";
import { bookingCancelledEmail, bookingConfirmationEmail, visitInvite, visitWhen, type BookingDetails } from "@/lib/email/booking";
import { resend } from "@/lib/email/resend";
import { replyTo } from "@/lib/replies/address";
import { newId } from "@/lib/ids";
import { appOrigin } from "@/lib/origin";
import { CHECKOUT_MINUTES, depositCheckout, depositsLive, refundDeposit } from "@/lib/payments/stripe";
import { buildPlan, type Plan } from "@/lib/plan/build";
import { keptPlan } from "@/lib/plan/keep";
import { loadReportData, type ReportData } from "@/lib/report/load";
import { getStore } from "@/lib/store";
import { SlotTakenError, type PlanWithItems } from "@/lib/store/types";
import { nextBooking, type BookingTarget } from "./next";
import { eventBlock, isOpen, openDays, type OpenDay } from "./slots";

/** An unpaid hold lapses after this long: Stripe's Checkout page has closed by then. */
export const HOLD_MINUTES = CHECKOUT_MINUTES + 5;
/** A client can cancel online, with the deposit refunded, up to this long before the visit. */
export const NOTICE_HOURS = 24;
/** Long enough for Resend on a slow day, short enough that a confirmation never hangs. */
const SEND_TIMEOUT_MS = 10_000;

export interface BookingContext {
  data: ReportData;
  now: Date;
  today: ISODate;
  plan: PlanWithItems | null;
  suggested: Plan | null;
  upcoming: Appointment | null;
  /** The treatment of the upcoming visit, for showing it. */
  upcomingTreatment: Treatment | null;
  /** "Session 2 of 3" for an upcoming visit in a course. */
  upcomingSession: string | null;
  target: BookingTarget | null;
  days: OpenDay[];
  practitionerId: string | null;
  /** The deposit this booking takes, in cents. 0 when the owner has switched deposits off or Stripe isn't set up. */
  depositCents: number;
}

/** The virtual "now" for this client's sandbox (DECISIONS D-016), whichever browser opens their link. */
export async function clientNow(client: Pick<Client, "sandboxId">): Promise<Date> {
  const sandbox = client.sandboxId ? await getStore().getSandbox(client.sandboxId) : null;
  return virtualNow(sandboxClock(env.DEMO_TODAY, sandbox));
}

const isHold = (a: Appointment) => a.status === "booked" && a.depositStatus === "pending";
const lapsed = (a: Appointment, now: Date) => isHold(a) && now.getTime() - Date.parse(a.createdAt) > HOLD_MINUTES * 60_000;

/** Everything the booking page needs, worked out fresh. Null when this link can't book. */
export async function bookingContext(token: string): Promise<BookingContext | null> {
  const data = await loadReportData(token);
  if (!data?.client.sandboxId) return null;
  const { client, clinic, intake, latest } = data;
  const store = getStore();
  const now = await clientNow(client);
  const today = isoDateInZone(now, clinic.timezone);
  const [appointments, plans, treatments, products, staff, settings] = await Promise.all([
    store.listAppointments(clinic.id, client.sandboxId!),
    store.listPlans(client.id),
    store.listTreatments(clinic.id),
    store.listProducts(clinic.id),
    store.listStaff(clinic.id),
    store.getClinicSettings(clinic.id, client.sandboxId),
  ]);
  const live = plans.filter((p) => p.status === "proposed" || p.status === "confirmed");
  const plan = live[live.length - 1] ?? null;
  const from = isoDateInZone(new Date(latest.completedAt ?? latest.createdAt), clinic.timezone);
  const suggested = plan ? null : buildPlan({ result: latest.result!, intake, treatments, products, clinic, from });

  // The client's own unpaid hold doesn't count: they're back on this page, so they've left that payment.
  const mine = appointments.filter((a) => a.clientId === client.id && !isHold(a));
  const { upcoming, target } = nextBooking({ plan, suggested, appointments: mine, treatments, now, today, timeZone: clinic.timezone });
  const item = upcoming?.planItemId ? plan?.items.find((i) => i.id === upcoming.planItemId) : undefined;
  const upcomingSession = item
    ? `Session ${mine.filter((a) => a.planItemId === item.id && a.status === "completed").length + 1} of ${item.quantity}`
    : null;
  const busy = appointments.filter((a) => a.status === "booked" && !lapsed(a, now) && !(isHold(a) && a.clientId === client.id));
  const days = target
    ? openDays({
        clinic,
        durationMinutes: target.treatment.durationMinutes,
        from: target.earliest,
        now,
        busy,
        blocked: eventBlock(intake?.eventDate ?? null, target.treatment.minDaysBeforeEvent),
      })
    : [];
  return {
    data,
    now,
    today,
    plan,
    suggested,
    upcoming,
    upcomingTreatment: upcoming ? (treatments.find((t) => t.id === upcoming.treatmentId) ?? null) : null,
    upcomingSession,
    target,
    days,
    practitionerId: staff.find((s) => s.role === "practitioner")?.id ?? null,
    // The owner's switch (DECISIONS D-066), and only when Stripe can take it.
    depositCents: settings.depositRequired && depositsLive() ? clinic.depositCents : 0,
  };
}

export type HoldResult = { ok: true; next: string } | { ok: false; error: string };

/**
 * Holds a time for the client and sends them on: to Stripe to pay the deposit, or straight to the confirmation when
 * deposits aren't set up. Everything is checked again here, so only a time that's really open can be held.
 */
export async function holdTime(token: string, startsAt: string): Promise<HoldResult> {
  const ctx = await bookingContext(token);
  if (!ctx) return { ok: false, error: "This link can't book a visit. Please call the clinic." };
  if (ctx.upcoming) return { ok: false, error: "You already have a visit booked. You'll find it on your report." };
  if (!ctx.target) return { ok: false, error: "There's nothing to book from your report just now. Please call the clinic." };
  if (!isOpen(ctx.days, startsAt)) return { ok: false, error: "That time isn't available any more. Please pick another." };

  const { client, clinic } = ctx.data;
  const store = getStore();
  await releaseHolds(clinic.id, client.sandboxId!, ctx.now, client.id);

  const takeDeposit = ctx.depositCents > 0;
  const appointment: Appointment = {
    id: newId(),
    clinicId: clinic.id,
    clientId: client.id,
    sandboxId: client.sandboxId,
    kind: "treatment",
    treatmentId: ctx.target.treatment.id,
    planItemId: ctx.target.planItemId,
    staffId: ctx.practitionerId,
    startsAt,
    endsAt: new Date(Date.parse(startsAt) + ctx.target.treatment.durationMinutes * 60_000).toISOString(),
    status: "booked",
    depositCents: ctx.depositCents,
    depositStatus: takeDeposit ? "pending" : "none",
    depositPaymentIntent: null,
    createdAt: ctx.now.toISOString(),
  };
  try {
    await store.addAppointment(appointment);
  } catch (e) {
    if (e instanceof SlotTakenError) return { ok: false, error: "Someone has just booked that time. Please pick another." };
    throw e;
  }

  if (!takeDeposit) {
    await settleBooking(appointment.id, null);
    return { ok: true, next: `/r/${token}/book/done` };
  }
  try {
    const checkout = await depositCheckout({
      appointmentId: appointment.id,
      clinicName: clinic.name,
      treatmentName: ctx.target.treatment.name,
      when: visitWhen(startsAt, clinic.timezone),
      depositCents: appointment.depositCents,
      email: client.email!,
      origin: await appOrigin(),
      noticeHours: NOTICE_HOURS,
    });
    return { ok: true, next: checkout.url };
  } catch (e) {
    console.error(`Deposit checkout not started: ${e instanceof Error ? e.message : String(e)}`);
    await store.transitionAppointment(appointment.id, { status: ["booked"], depositStatus: ["pending"] }, { status: "cancelled" });
    return { ok: false, error: "Payments aren't answering just now, so nothing was booked. Please try again in a moment." };
  }
}

/** Lets go of unpaid holds that have lapsed in this sandbox, and any this client left behind. */
async function releaseHolds(clinicId: string, sandboxId: string, now: Date, clientId: string): Promise<void> {
  const store = getStore();
  const stale = (await store.listAppointments(clinicId, sandboxId)).filter((a) => lapsed(a, now) || (isHold(a) && a.clientId === clientId));
  await Promise.all(stale.map((a) => store.transitionAppointment(a.id, { status: ["booked"], depositStatus: ["pending"] }, { status: "cancelled" })));
}

/** Gives back a time held for payment that the client walked away from. Only ever touches an unpaid hold. */
export async function releaseHold(appointmentId: string): Promise<Appointment | null> {
  const store = getStore();
  await store.transitionAppointment(appointmentId, { status: ["booked"], depositStatus: ["pending"] }, { status: "cancelled" });
  return store.getAppointment(appointmentId);
}

export type Settled = "confirmed" | "already" | "refunded" | "missing";

/**
 * Confirms a booked visit: the deposit paid (or none taken), the suggested plan kept, the client marked booked, and
 * the confirmation sent. Runs from the Checkout return, the webhook, or straight after holding without Stripe, in any
 * order and any number of times: only the first does anything.
 */
export async function settleBooking(appointmentId: string, paymentIntent: string | null): Promise<Settled> {
  const store = getStore();
  const before = await store.getAppointment(appointmentId);
  if (!before) return "missing";

  let confirmed: Appointment | null;
  if (before.depositStatus === "none") {
    // No deposit: holding it was booking it. Settle once, keyed on the plan link and the outbox's dedupe key below.
    confirmed = before.status === "booked" ? before : null;
  } else {
    confirmed = await store.transitionAppointment(
      appointmentId,
      { status: ["booked"], depositStatus: ["pending"] },
      { depositStatus: "paid", depositPaymentIntent: paymentIntent },
    );
    if (!confirmed) {
      const current = await store.getAppointment(appointmentId);
      if (!current || current.depositStatus !== "pending") return "already";
      // Paid after the hold lapsed: book it again if the time is still free, otherwise give the money back.
      try {
        confirmed = await store.transitionAppointment(
          appointmentId,
          { status: ["cancelled"], depositStatus: ["pending"] },
          { status: "booked", depositStatus: "paid", depositPaymentIntent: paymentIntent },
        );
      } catch (e) {
        if (!(e instanceof SlotTakenError)) throw e;
        if (paymentIntent) await refundDeposit(appointmentId, paymentIntent);
        await store.transitionAppointment(appointmentId, { status: ["cancelled"], depositStatus: ["pending"] }, { depositStatus: "refunded", depositPaymentIntent: paymentIntent });
        return "refunded";
      }
      if (!confirmed) return "already";
    }
  }
  if (!confirmed) return "already";

  const client = await store.getClient(confirmed.clientId);
  const clinic = client ? await store.getClinic(client.clinicId) : null;
  if (!client || !clinic) return "missing";
  const now = await clientNow(client);
  confirmed = await keepPlan(confirmed, client, clinic, now);
  if (client.status === "lead" || client.status === "started") await store.updateClient(client.id, { status: "booked" });
  const sent = await sendBookingEmail("confirmed", confirmed, client, clinic, now);
  return sent === "duplicate" ? "already" : "confirmed";
}

/**
 * A first booking from the report keeps the plan the report suggested, as "proposed", so the practitioner sees what
 * was agreed and confirms it at the visit (DECISIONS D-055). The visit is linked to its line of that plan.
 */
async function keepPlan(appointment: Appointment, client: Client, clinic: Clinic, now: Date): Promise<Appointment> {
  if (appointment.planItemId || !appointment.treatmentId) return appointment;
  const store = getStore();
  const livePlan = async () => (await store.listPlans(client.id)).filter((p) => p.status === "proposed" || p.status === "confirmed").at(-1) ?? null;
  // A client with a plan books against its lines already. Without one (a maintenance visit), the visit stays apart.
  if (await livePlan()) return appointment;
  const latest = (await store.listScans(client.id)).filter((s) => s.status === "complete" && s.result).at(-1);
  if (!latest) return appointment;
  const [treatments, products, intake] = await Promise.all([store.listTreatments(clinic.id), store.listProducts(clinic.id), store.getIntake(client.id)]);
  const from = isoDateInZone(new Date(latest.completedAt ?? latest.createdAt), clinic.timezone);
  const plan = buildPlan({ result: latest.result!, intake, treatments, products, clinic, from });
  const kept = keptPlan({ plan, clientId: client.id, scanId: latest.id, status: "proposed", confirmedBy: null, now });
  // Null when another request kept it a moment ago: use that one.
  const saved = (await store.createPlan(kept.plan, kept.items)) ?? (await livePlan());
  const item = saved?.items.find((i) => i.treatmentId === appointment.treatmentId);
  if (!item) return appointment;
  return (await store.transitionAppointment(appointment.id, { status: ["booked"] }, { planItemId: item.id })) ?? appointment;
}

export type CancelResult = { ok: true; refunded: boolean } | { ok: false; error: string };

/** The client cancels from their report. Up to NOTICE_HOURS before, the deposit comes back in full. */
export async function cancelVisit(token: string, appointmentId: string): Promise<CancelResult> {
  const ctx = await bookingContext(token);
  if (!ctx) return { ok: false, error: "This link can't change a visit. Please call the clinic." };
  const { client, clinic } = ctx.data;
  const store = getStore();
  const appointment = await store.getAppointment(appointmentId);
  if (!appointment || appointment.clientId !== client.id || appointment.status !== "booked") {
    return { ok: false, error: "This visit has already been changed. Please reload the page." };
  }
  const hours = (Date.parse(appointment.startsAt) - ctx.now.getTime()) / 3_600_000;
  if (hours < NOTICE_HOURS) {
    return { ok: false, error: `Your visit is less than ${NOTICE_HOURS} hours away, so please call us on ${clinic.phone} to change it.` };
  }
  const refund = appointment.depositStatus === "paid" && Boolean(appointment.depositPaymentIntent) && depositsLive();
  if (refund) {
    try {
      await refundDeposit(appointment.id, appointment.depositPaymentIntent!);
    } catch (e) {
      console.error(`Refund failed: ${e instanceof Error ? e.message : String(e)}`);
      return { ok: false, error: `We couldn't refund the deposit just now, so the visit is still booked. Please try again, or call us on ${clinic.phone}.` };
    }
  }
  const cancelled = await store.transitionAppointment(
    appointment.id,
    { status: ["booked"] },
    { status: "cancelled", ...(refund ? { depositStatus: "refunded" as const } : {}) },
  );
  if (!cancelled) return { ok: false, error: "This visit has already been changed. Please reload the page." };
  if (client.status === "booked") await store.updateClient(client.id, { status: "lead" });
  await sendBookingEmail("cancelled", cancelled, client, clinic, ctx.now, refund);
  return { ok: true, refunded: refund };
}

/**
 * Sends the confirmation or cancellation and records it in the clinic's outbox. A real client gets the email when
 * Resend is set up; a demo client's is only logged (DECISIONS D-053). Never throws: the booking stands either way.
 */
async function sendBookingEmail(
  kind: "confirmed" | "cancelled",
  appointment: Appointment,
  client: Client,
  clinic: Clinic,
  now: Date,
  refunded = false,
): Promise<"sent" | "logged" | "failed" | "duplicate"> {
  const store = getStore();
  const dedupeKey = `booking_${kind}:${appointment.id}`;
  const treatment = (await store.listTreatments(clinic.id)).find((t) => t.id === appointment.treatmentId);
  const report = await store.getOrCreateReport(client.id, now);
  const reportUrl = `${await appOrigin()}/r/${report.token}`;
  const details: BookingDetails = {
    clinic,
    firstName: client.firstName ?? "there",
    treatmentName: treatment?.name ?? (appointment.kind === "consult" ? "a consultation" : "your treatment"),
    startsAt: appointment.startsAt,
    endsAt: appointment.endsAt,
    depositCents: appointment.depositStatus === "none" ? 0 : appointment.depositCents,
    reportUrl,
    noticeHours: NOTICE_HOURS,
  };
  const mail = kind === "confirmed" ? bookingConfirmationEmail(details) : bookingCancelledEmail({ ...details, refunded });
  const invite = visitInvite({
    uid: appointment.id,
    clinic,
    treatmentName: details.treatmentName,
    startsAt: appointment.startsAt,
    endsAt: appointment.endsAt,
    reportUrl,
    now,
    cancelled: kind === "cancelled",
  });

  // The outbox entry goes first: its dedupe key is what makes a confirmation go once, however many times it settles.
  const live = features.email && !client.isDemo && Boolean(client.email);
  const message = await store.addMessage({
    clinicId: clinic.id,
    clientId: client.id,
    sandboxId: client.sandboxId,
    type: kind === "confirmed" ? "booking_confirmation" : "booking_cancelled",
    channel: "email",
    subject: mail.subject,
    body: mail.text,
    status: live ? "queued" : "sent",
    dedupeKey,
    scheduledFor: null,
    sentAt: live ? null : now.toISOString(),
    createdAt: now.toISOString(),
  });
  if (!message) return "duplicate";
  if (!live) return "logged";

  let delivered = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("Resend didn't answer in time.")), SEND_TIMEOUT_MS);
    });
    const { error } = await Promise.race([
      resend().emails.send(
        {
          from: mail.from,
          to: client.email!,
          replyTo: replyTo(clinic, client.id),
          subject: mail.subject,
          text: mail.text,
          html: mail.html,
          attachments: [{ filename: kind === "confirmed" ? "visit.ics" : "visit-cancelled.ics", content: Buffer.from(invite), contentType: "text/calendar" }],
        },
        { idempotencyKey: dedupeKey },
      ),
      timeout,
    ]);
    if (error) console.error(`Booking email not sent (${error.name}): ${error.message}`);
    delivered = !error;
  } catch (e) {
    console.error(`Booking email not sent: ${e instanceof Error ? e.message : String(e)}`);
  } finally {
    clearTimeout(timer);
  }
  await store
    .updateMessage(message.id, delivered ? { status: "sent", sentAt: now.toISOString() } : { status: "failed" })
    .catch((e) => console.error(`Booking email not recorded: ${e instanceof Error ? e.message : String(e)}`));
  return delivered ? "sent" : "failed";
}
