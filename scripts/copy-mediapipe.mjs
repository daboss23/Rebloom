// Copies MediaPipe's WASM runtime from node_modules into /public/mediapipe so the
// capture page never depends on a third-party CDN. Runs before dev and build.
// The model file (face_landmarker.task) is committed; the WASM files are not.
import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";

const pkgDir = path.join("node_modules", "@mediapipe", "tasks-vision");
const dest = "public/mediapipe/wasm";
await mkdir(dest, { recursive: true });
for (const f of [
  "vision_wasm_internal.js",
  "vision_wasm_internal.wasm",
  "vision_wasm_nosimd_internal.js",
  "vision_wasm_nosimd_internal.wasm",
]) {
  await copyFile(path.join(pkgDir, "wasm", f), path.join(dest, f));
}
