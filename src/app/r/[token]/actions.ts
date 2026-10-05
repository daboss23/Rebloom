"use server";

import { redirect } from "next/navigation";
import { clearVisitClientId, sandboxNow } from "@/lib/sandbox";
import { getStorage, getStore } from "@/lib/store";

/** "Delete my data" (brief sections 5 and 10). The report token is the authority. */
export async function deleteMyData(token: string): Promise<void> {
  const store = getStore();
  const report = await store.getReportByToken(token);
  if (!report) redirect("/");
  const client = await store.getClient(report.clientId);
  const clinic = client ? await store.getClinic(client.clinicId) : null;
  const { storagePaths } = await store.deleteClientData(report.clientId, await sandboxNow());
  await getStorage().remove(storagePaths);
  if (clinic) await clearVisitClientId(clinic.slug);
  redirect(clinic ? `/c/${clinic.slug}/deleted` : "/");
}
