"use client";
// Loads MediaPipe Face Landmarker from our own /public folder (DECISIONS D-024).
import type { FaceLandmarker } from "@mediapipe/tasks-vision";

type Mode = "VIDEO" | "IMAGE";
const cache: Partial<Record<Mode, Promise<FaceLandmarker>>> = {};

const WASM_BASE = "/mediapipe/wasm";
const MODEL_PATH = "/mediapipe/face_landmarker.task";

async function create(mode: Mode): Promise<FaceLandmarker> {
  const { FaceLandmarker, FilesetResolver } = await import("@mediapipe/tasks-vision");
  const fileset = await FilesetResolver.forVisionTasks(WASM_BASE);
  const options = (delegate: "GPU" | "CPU") => ({
    baseOptions: { modelAssetPath: MODEL_PATH, delegate },
    runningMode: mode,
    numFaces: 2, // so we can tell people when there's more than one face
    outputFaceBlendshapes: true,
    outputFacialTransformationMatrixes: true,
  });
  try {
    return await FaceLandmarker.createFromOptions(fileset, options("GPU"));
  } catch {
    return await FaceLandmarker.createFromOptions(fileset, options("CPU"));
  }
}

export function getLandmarker(mode: Mode): Promise<FaceLandmarker> {
  cache[mode] ??= create(mode).catch((e) => {
    delete cache[mode];
    throw e;
  });
  return cache[mode]!;
}

let prefetched: Promise<void> | undefined;

/**
 * Downloads the face guide's files (about 15 MB) into the browser cache without starting it, so the
 * camera screen doesn't wait on them. Network only: no processing, so it can't slow the page down.
 * Fetches only the build this browser will use (with or without SIMD). Failures are ignored; the
 * camera screen loads the files itself and reports any real problem.
 */
export function prefetchFaceGuide(): void {
  prefetched ??= (async () => {
    const { FilesetResolver } = await import("@mediapipe/tasks-vision");
    const fileset = await FilesetResolver.forVisionTasks(WASM_BASE);
    await Promise.all(
      [fileset.wasmLoaderPath, fileset.wasmBinaryPath, MODEL_PATH].map((url) => fetch(url).then((r) => r.arrayBuffer())),
    );
  })().catch(() => {
    prefetched = undefined;
  });
}
