import { z } from "zod";

const quality = z.object({
  method: z.enum(["camera", "upload"]),
  faceWidthRatio: z.number(),
  centerOffset: z.number(),
  yaw: z.number(),
  pitch: z.number(),
  roll: z.number(),
  luminance: z.number(),
  clippedShare: z.number(),
  evenness: z.number(),
  warmth: z.number(),
  sharpness: z.number(),
  eyesOpen: z.number(),
  passedGate: z.boolean(),
});

/** What a browser sends for a new scan. A rescan sends the same, keyed by its report link instead. */
export const scanBody = z.object({
  width: z.number().int().min(360).max(4000),
  height: z.number().int().min(480).max(5400),
  quality,
  landmarks: z.array(z.tuple([z.number().min(-0.5).max(1.5), z.number().min(-0.5).max(1.5)])).min(468).max(478),
});
