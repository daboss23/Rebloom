// Clinic staff (brief section 9). Shared by every sandbox: only clients are copied per sandbox.
import type { Staff } from "@/lib/domain";
import { stableId } from "@/lib/ids";
import { MAISON_VERRE, TIDEWATER } from "./clinics";

const staff = (clinic: { id: string; slug: string }, key: string, s: Pick<Staff, "name" | "title" | "role">): Staff => ({
  id: stableId(`staff:${clinic.slug}:${key}`),
  clinicId: clinic.id,
  userId: null,
  createdAt: "2026-10-05T00:00:00.000Z",
  ...s,
});

/** "Enter demo as Dana" signs in as the first practitioner. */
export const DANA = staff(MAISON_VERRE, "dana", { name: "Dana", title: "Lead Aesthetician", role: "practitioner" });

export const SEED_STAFF: Staff[] = [
  DANA,
  staff(MAISON_VERRE, "claire", { name: "Claire", title: "Owner", role: "owner" }),
  staff(TIDEWATER, "maya", { name: "Maya", title: "Lead Aesthetician", role: "practitioner" }),
  staff(TIDEWATER, "rosa", { name: "Rosa", title: "Owner", role: "owner" }),
];
