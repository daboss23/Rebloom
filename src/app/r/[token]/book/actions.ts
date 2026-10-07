"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { cancelVisit, holdTime } from "@/lib/booking/service";

export interface BookingActionResult {
  ok: boolean;
  error?: string;
}

const timeInput = z.object({ token: z.string().min(20).max(64), startsAt: z.iso.datetime() });

/** "Book this time": holds it, then off to pay the deposit, or straight to the confirmation. The token is the authority. */
export async function bookTime(input: z.input<typeof timeInput>): Promise<BookingActionResult> {
  const parsed = timeInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Please choose a time." };
  const result = await holdTime(parsed.data.token, parsed.data.startsAt);
  if (!result.ok) {
    revalidatePath(`/r/${parsed.data.token}/book`);
    return result;
  }
  redirect(result.next);
}

const cancelInput = z.object({ token: z.string().min(20).max(64), appointmentId: z.string().min(1).max(64) });

/** "Cancel this visit", from the report. Refunds the deposit when it's early enough. */
export async function cancelBooking(input: z.input<typeof cancelInput>): Promise<BookingActionResult> {
  const parsed = cancelInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Something went wrong. Please reload the page." };
  const result = await cancelVisit(parsed.data.token, parsed.data.appointmentId);
  if (!result.ok) return result;
  revalidatePath(`/r/${parsed.data.token}`, "layout");
  redirect(`/r/${parsed.data.token}/book?cancelled=${result.refunded ? "refunded" : "1"}`);
}
