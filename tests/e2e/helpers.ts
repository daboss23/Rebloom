import { expect, type Page } from "@playwright/test";

/** Consent and all seven intake questions, ending on the capture screen. */
export async function completeIntake(page: Page, clinic = "maison-verre") {
  await page.goto(`/c/${clinic}`);
  await page.getByRole("link", { name: "Begin" }).click();
  await expect(page.getByRole("heading", { name: "Your photo, your choice." })).toBeVisible();
  const cont = page.getByRole("button", { name: "Continue", exact: true });
  await expect(cont).toBeDisabled();
  await page.locator("label[for=biometric]").click();
  await cont.click();

  await expect(page.getByText("1 of 7")).toBeVisible();
  await page.getByRole("button", { name: "Texture" }).click();
  await cont.click();
  await page.getByLabel("What you would like to change").fill("Smoother, more even skin for my wedding.");
  await cont.click();
  await page.getByRole("button", { name: "Yes, there's a date" }).click();
  await page.getByRole("button", { name: "Wedding" }).click();
  await page.getByLabel("Date").fill("2030-06-01");
  await cont.click();
  await page.getByRole("button", { name: "None yet" }).click();
  await cont.click();
  await page.getByRole("button", { name: "$1,000 to $2,000" }).click();
  await cont.click();
  await page.getByRole("group", { name: /retinoid/ }).getByRole("button", { name: "Yes" }).click();
  await cont.click();
  await page.getByRole("button", { name: "Continue to your photo" }).click();
  await expect(page).toHaveURL(/\/capture$/);
}

/** Capture metrics for a photo that passed the quality gate. */
export const GOOD_QUALITY = {
  method: "upload", faceWidthRatio: 0.7, centerOffset: 0, yaw: 0, pitch: 0, roll: 0, luminance: 140,
  clippedShare: 0, evenness: 0.95, warmth: 1.4, sharpness: 900, eyesOpen: 0.95, passedGate: true,
};

/** A synthetic face layout: only the landmarks the pipeline uses are placed. No real face involved. */
export function syntheticLandmarks(): [number, number][] {
  const points: [number, number][] = Array.from({ length: 478 }, () => [0.5, 0.47]);
  const set: Record<number, [number, number]> = {
    10: [0.5, 0.2], 152: [0.5, 0.82], 1: [0.5, 0.52], 33: [0.36, 0.4], 133: [0.45, 0.4], 362: [0.55, 0.4],
    263: [0.64, 0.4], 61: [0.42, 0.65], 291: [0.58, 0.65], 234: [0.17, 0.45], 454: [0.83, 0.45], 105: [0.4, 0.33], 334: [0.6, 0.33],
  };
  for (const [i, p] of Object.entries(set)) points[Number(i)] = p;
  return points;
}
