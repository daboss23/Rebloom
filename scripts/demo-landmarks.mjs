// Finds the face on each demo portrait (DECISIONS D-070) with the same Face Landmarker model the capture page
// uses, and writes src/data/demo-landmarks.json, so demo clients' face maps carry marks like a real scan's.
// Run again after replacing a portrait:
//   node scripts/demo-landmarks.mjs
// In the Claude cloud workspace, set PW_CHROMIUM_PATH=/opt/pw-browsers/chromium.
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";

const NAMES = ["amelia", "priya", "marcus", "sofia", "grace", "hannah", "olivia", "daniel", "nina", "chloe", "isabel", "rachel"];
const ORIGIN = "http://portraits.local";
const FILES = {
  "/vision_bundle.mjs": "node_modules/@mediapipe/tasks-vision/vision_bundle.mjs",
  "/face_landmarker.task": "public/mediapipe/face_landmarker.task",
};
const type = (p) => (p.endsWith(".mjs") || p.endsWith(".js") ? "text/javascript" : p.endsWith(".wasm") ? "application/wasm" : p.endsWith(".jpg") ? "image/jpeg" : "application/octet-stream");

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM_PATH || undefined });
const page = await browser.newPage();
// Everything is served from disk: no network, no dev server.
await page.route(`${ORIGIN}/**`, async (route) => {
  const url = new URL(route.request().url()).pathname;
  const file = FILES[url] ?? (url.startsWith("/wasm/") ? `node_modules/@mediapipe/tasks-vision${url}` : url.startsWith("/demo-portraits/") ? `public${url}` : null);
  if (!file) return route.fulfill({ status: 404, body: "" });
  return route.fulfill({ status: 200, contentType: type(file), body: await readFile(path.resolve(file)) });
});
await page.route(`${ORIGIN}/`, (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>landmarks</title>" }));
await page.goto(`${ORIGIN}/`);

const result = await page.evaluate(async (names) => {
  const { FaceLandmarker, FilesetResolver } = await import("/vision_bundle.mjs");
  const fileset = await FilesetResolver.forVisionTasks("/wasm");
  const landmarker = await FaceLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: "/face_landmarker.task", delegate: "CPU" },
    runningMode: "IMAGE",
    numFaces: 2,
  });
  const out = {};
  for (const name of names) {
    const img = new Image();
    img.src = `/demo-portraits/${name}.jpg`;
    await img.decode();
    const faces = landmarker.detect(img).faceLandmarks;
    if (faces.length !== 1) throw new Error(`${name}: found ${faces.length} faces, expected 1`);
    // Normalised to the image, rounded like a capture's (packLandmarks). Portraits are never mirrored.
    out[name] = faces[0].map((p) => [Math.round(p.x * 1e4) / 1e4, Math.round(p.y * 1e4) / 1e4]);
  }
  return out;
}, NAMES);
await browser.close();

for (const [name, points] of Object.entries(result)) console.log(`${name}: ${points.length} points`);
// One portrait per line keeps the file's diff readable when a single portrait changes.
const json = `{\n${NAMES.map((n) => `  ${JSON.stringify(n)}: ${JSON.stringify(result[n])}`).join(",\n")}\n}\n`;
await writeFile(path.resolve("src/data/demo-landmarks.json"), json);
console.log("Wrote src/data/demo-landmarks.json");
