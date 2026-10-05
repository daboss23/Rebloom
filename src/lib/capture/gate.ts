// Turns raw capture metrics into one calm instruction at a time (brief 6.2).
import type { CaptureQuality } from "@/lib/domain";
import { GATE, LIGHT_MATCH } from "./thresholds";

export type CheckKey =
  | "no_face"
  | "multiple_faces"
  | "resolution"
  | "too_far"
  | "too_close"
  | "off_center"
  | "pose"
  | "dark"
  | "bright"
  | "uneven"
  | "eyes"
  | "mouth"
  | "blurry"
  | "moving";

/** Ordered by what a person should fix first. */
const ORDER: CheckKey[] = [
  "no_face",
  "multiple_faces",
  "resolution",
  "too_far",
  "too_close",
  "off_center",
  "pose",
  "dark",
  "bright",
  "uneven",
  "eyes",
  "mouth",
  "moving",
  "blurry",
];

export const INSTRUCTIONS: Record<CheckKey | "ready", string> = {
  no_face: "Bring your face into the oval",
  multiple_faces: "Just one face in the frame, please",
  resolution: "This camera's picture is too small. Try uploading a photo instead",
  too_far: "Move a little closer",
  too_close: "Move back a little",
  off_center: "Center your face in the oval",
  pose: "Look straight at the camera",
  dark: "Find brighter light. A window works well",
  bright: "Step back from direct light",
  uneven: "Face the light evenly",
  eyes: "Keep your eyes gently open",
  mouth: "Close your lips gently",
  moving: "Hold still",
  blurry: "Hold still",
  ready: "That's it. Hold still",
};

/** Friendly retry copy for a photo that didn't pass, used for uploads. */
export const UPLOAD_PROBLEMS: Partial<Record<CheckKey, string>> = {
  no_face: "We couldn't find a face in this photo.",
  multiple_faces: "This photo has more than one face.",
  resolution: "This photo is too small for a reliable result.",
  too_far: "Your face is too small in this photo. Try one taken closer.",
  too_close: "Your face is cut off at the edges. Try one with a little more space.",
  off_center: "Your face is too close to the edge of this photo.",
  pose: "Your head is turned in this photo. Try one looking straight at the camera.",
  dark: "This photo is too dark. Try one in bright, even light.",
  bright: "Parts of this photo are washed out by strong light.",
  uneven: "The light falls unevenly across your face in this photo.",
  eyes: "Your eyes look closed in this photo.",
  mouth: "Your mouth is open in this photo.",
  blurry: "This photo looks a little blurred.",
};

export interface FrameMetrics {
  faceCount: number;
  shortSide: number;
  faceWidthRatio: number;
  centerX: number;
  centerY: number;
  yaw: number;
  pitch: number;
  roll: number;
  luminance: number;
  clippedShare: number;
  unevenness: number;
  warmth: number;
  sharpness: number;
  eyeBlink: number;
  jawOpen: number;
  /** Movement since the previous check, or 0 for still images. */
  movement: number;
}

export function failingChecks(m: FrameMetrics, opts: { still?: boolean } = {}): CheckKey[] {
  const fails = new Set<CheckKey>();
  if (m.faceCount === 0) return ["no_face"];
  if (m.faceCount > 1) return ["multiple_faces"];
  if (m.shortSide < GATE.minShortSide) fails.add("resolution");
  if (m.faceWidthRatio < GATE.minFaceWidth) fails.add("too_far");
  if (m.faceWidthRatio > GATE.maxFaceWidth) fails.add("too_close");
  if (Math.abs(m.centerX - 0.5) > GATE.maxCenterOffsetX || Math.abs(m.centerY - GATE.targetCenterY) > GATE.maxCenterOffsetY) {
    fails.add("off_center");
  }
  if (Math.abs(m.yaw) > GATE.maxYaw || Math.abs(m.pitch) > GATE.maxPitch || Math.abs(m.roll) > GATE.maxRoll) fails.add("pose");
  if (m.luminance < GATE.minLuminance) fails.add("dark");
  if (m.luminance > GATE.maxLuminance || m.clippedShare > GATE.maxClippedShare) fails.add("bright");
  if (m.unevenness > GATE.maxUnevenness) fails.add("uneven");
  if (m.eyeBlink > GATE.maxEyeBlink) fails.add("eyes");
  if (m.jawOpen > GATE.maxJawOpen) fails.add("mouth");
  if (!opts.still && m.movement > GATE.maxMovement) fails.add("moving");
  if (m.sharpness < GATE.minSharpness) fails.add("blurry");
  return ORDER.filter((k) => fails.has(k));
}

export function instructionFor(fails: CheckKey[]): string {
  return INSTRUCTIONS[fails[0] ?? "ready"];
}

export function toCaptureQuality(m: FrameMetrics, method: "camera" | "upload", passedGate: boolean): CaptureQuality {
  const r = (v: number, d = 3) => Math.round(v * 10 ** d) / 10 ** d;
  return {
    method,
    faceWidthRatio: r(m.faceWidthRatio),
    centerOffset: r(Math.hypot(m.centerX - 0.5, m.centerY - GATE.targetCenterY)),
    yaw: r(m.yaw, 1),
    pitch: r(m.pitch, 1),
    roll: r(m.roll, 1),
    luminance: r(m.luminance, 1),
    clippedShare: r(m.clippedShare),
    evenness: r(1 - m.unevenness),
    warmth: r(m.warmth),
    sharpness: r(m.sharpness, 1),
    eyesOpen: r(1 - m.eyeBlink),
    passedGate,
  };
}

/** Rescans: does this light match scan 01's? Guidance only, never a block (DECISIONS D-011). */
export function lightMatch(
  baseline: Pick<CaptureQuality, "luminance" | "warmth">,
  current: Pick<CaptureQuality, "luminance" | "warmth">,
): { matches: boolean; hint: string | null } {
  const dl = current.luminance - baseline.luminance;
  const dw = current.warmth - baseline.warmth;
  if (Math.abs(dl) > LIGHT_MATCH.maxLuminanceDelta) {
    return { matches: false, hint: dl < 0 ? "A little brighter, to match your first scan" : "A little softer light, to match your first scan" };
  }
  if (Math.abs(dw) > LIGHT_MATCH.maxWarmthDelta) {
    return { matches: false, hint: dw > 0 ? "Your light looks warmer than last time. Daylight matches best" : "Your light looks cooler than last time. Try the same spot as before" };
  }
  return { matches: true, hint: null };
}
