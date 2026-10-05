"use client";
// Loads MediaPipe Face Landmarker from our own /public folder (DECISIONS D-024).
import type { FaceLandmarker } from "@mediapipe/tasks-vision";

type Mode = "VIDEO" | "IMAGE";
const cache: Partial<Record<Mode, Promise<FaceLandmarker>>> = {};

async function create(mode: Mode): Promise<FaceLandmarker> {
  const { FaceLandmarker, FilesetResolver } = await import("@mediapipe/tasks-vision");
  const fileset = await FilesetResolver.forVisionTasks("/mediapipe/wasm");
  const options = (delegate: "GPU" | "CPU") => ({
    baseOptions: { modelAssetPath: "/mediapipe/face_landmarker.task", delegate },
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
