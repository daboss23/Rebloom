import "server-only";
// Who is using the dashboard. Until clinic login arrives (brief 3.2: Supabase magic link), the only way in
// is "Enter demo as Dana", which signs this browser in as a demo practitioner (DECISIONS D-052).
// The demo sees only its own sandbox's copy of the clients, so nothing here can reach real data.

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Clinic, Staff } from "@/lib/domain";
import { readSandboxId } from "@/lib/sandbox";
import { getStore } from "@/lib/store";

export const STAFF_COOKIE = "rb_staff";

const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 30 * 86_400,
};

export interface DashboardSession {
  staff: Staff;
  clinic: Clinic;
  sandboxId: string;
}

export async function setStaffCookie(staffId: string): Promise<void> {
  (await cookies()).set(STAFF_COOKIE, staffId, cookieOptions);
}

export async function clearStaffCookie(): Promise<void> {
  (await cookies()).delete(STAFF_COOKIE);
}

/** The signed-in practitioner, their clinic and this browser's sandbox. Null when any is missing. */
export async function readSession(): Promise<DashboardSession | null> {
  const [jar, sandboxId] = [await cookies(), await readSandboxId()];
  const staffId = jar.get(STAFF_COOKIE)?.value;
  if (!staffId || !sandboxId) return null;
  const store = getStore();
  const [clinics, sandbox] = await Promise.all([store.listClinics(), store.getSandbox(sandboxId)]);
  if (!sandbox) return null;
  for (const clinic of clinics) {
    const staff = (await store.listStaff(clinic.id)).find((s) => s.id === staffId);
    if (staff) return { staff, clinic, sandboxId };
  }
  return null;
}

/** Pages: sends anyone not signed in to the door. */
export async function requireSession(): Promise<DashboardSession> {
  const session = await readSession();
  if (!session) redirect("/dashboard/enter");
  return session;
}
