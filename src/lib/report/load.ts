import "server-only";
import { notFound } from "next/navigation";
import { cache } from "react";
import type { Client, Clinic, Intake, Report, Scan } from "@/lib/domain";
import { getStore } from "@/lib/store";

export interface ReportData {
  report: Report;
  client: Client;
  clinic: Clinic;
  intake: Intake | null;
  scans: Scan[];
  latest: Scan;
}

/** Loads everything a report link can see. The token is the only key (brief section 5). */
export const loadReport = cache(async (token: string): Promise<ReportData> => {
  const store = getStore();
  const report = token.length >= 20 ? await store.getReportByToken(token) : null;
  if (!report) notFound();
  const client = await store.getClient(report.clientId);
  if (!client) notFound();
  const [clinic, intake, allScans] = await Promise.all([
    store.getClinic(client.clinicId),
    store.getIntake(client.id),
    store.listScans(client.id),
  ]);
  const scans = allScans.filter((s) => s.status === "complete" && s.result);
  if (!clinic || scans.length === 0) notFound();
  return { report, client, clinic, intake, scans, latest: scans[scans.length - 1] };
});

/** Finds a scan that belongs to this report, or null. */
export async function scanForReport(token: string, scanId: string): Promise<Scan | null> {
  const store = getStore();
  const report = await store.getReportByToken(token);
  const scan = report ? await store.getScan(scanId) : null;
  return scan && report && scan.clientId === report.clientId ? scan : null;
}
