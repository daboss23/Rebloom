import "server-only";
import { notFound } from "next/navigation";
import { cache } from "react";
import type { Client, Clinic, Intake, Report, Scan } from "@/lib/domain";
import { isoDateInZone } from "@/lib/clock";
import { buildPlan, type Plan } from "@/lib/plan/build";
import { getStore } from "@/lib/store";

export interface ReportData {
  report: Report;
  client: Client;
  clinic: Clinic;
  intake: Intake | null;
  scans: Scan[];
  latest: Scan;
}

/** Everything a report link can see, or null. The token is the only key (brief section 5). */
export const loadReportData = cache(async (token: string): Promise<ReportData | null> => {
  const store = getStore();
  const report = token.length >= 20 ? await store.getReportByToken(token) : null;
  if (!report) return null;
  const client = await store.getClient(report.clientId);
  // A report only exists for clients who opted in at the gate.
  if (!client?.email) return null;
  const [clinic, intake, allScans] = await Promise.all([
    store.getClinic(client.clinicId),
    store.getIntake(client.id),
    store.listScans(client.id),
  ]);
  const scans = allScans.filter((s) => s.status === "complete" && s.result);
  if (!clinic || scans.length === 0) return null;
  return { report, client, clinic, intake, scans, latest: scans[scans.length - 1] };
});

/** As loadReportData, for pages: a link that shows nothing is a 404. */
export async function loadReport(token: string): Promise<ReportData> {
  const data = await loadReportData(token);
  if (!data) notFound();
  return data;
}

/** The plan for a report's latest scan, and the date it counts from. Same inputs, same plan, everywhere. */
export const reportPlan = cache(async (token: string): Promise<{ plan: Plan; from: string } | null> => {
  const data = await loadReportData(token);
  if (!data) return null;
  const store = getStore();
  const [treatments, products] = await Promise.all([store.listTreatments(data.clinic.id), store.listProducts(data.clinic.id)]);
  // Dates count from the scan, so the plan doesn't drift each time the link is opened.
  const from = isoDateInZone(new Date(data.latest.completedAt ?? data.latest.createdAt), data.clinic.timezone);
  const plan = buildPlan({ result: data.latest.result!, intake: data.intake, treatments, products, clinic: data.clinic, from });
  return { plan, from };
});

/** Finds a scan that belongs to this report, or null. */
export async function scanForReport(token: string, scanId: string): Promise<Scan | null> {
  const store = getStore();
  const report = await store.getReportByToken(token);
  const scan = report ? await store.getScan(scanId) : null;
  const client = report ? await store.getClient(report.clientId) : null;
  return scan && report && client?.email && scan.clientId === report.clientId ? scan : null;
}
