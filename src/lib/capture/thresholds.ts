// Every capture-gate threshold in one place (brief 6.2). Starting values: tune on real phones
// during the Week 1 calibration session and record changes in DECISIONS.md.
export const GATE = {
  /** Face width ÷ frame width. YouCam requires > 0.60; we ask a little more. */
  minFaceWidth: 0.62,
  maxFaceWidth: 0.9,
  /** Max distance of the face centre from the target point, as a share of the frame. */
  maxCenterOffsetX: 0.08,
  maxCenterOffsetY: 0.1,
  /** Where the face centre should sit vertically (slightly above the middle). */
  targetCenterY: 0.47,
  /** Head pose, degrees. */
  maxYaw: 10,
  maxPitch: 10,
  maxRoll: 12,
  /** Face-region luma, 0 to 255. */
  minLuminance: 80,
  maxLuminance: 205,
  /** Share of face pixels that are blown out (luma >= 250). */
  maxClippedShare: 0.03,
  /** Left versus right cheek brightness difference, as a share. */
  maxUnevenness: 0.15,
  /** Variance of the Laplacian on the face region of a 240 x 320 frame. A sharp test photo measured ~1,470. */
  minSharpness: 120,
  /** Blendshape scores, 0 to 1. */
  maxEyeBlink: 0.45,
  maxJawOpen: 0.3,
  /** Face centre movement between checks, as a share of the frame. */
  maxMovement: 0.015,
  /** The short side of the cropped photo, in pixels. YouCam SD needs 480. */
  minShortSide: 480,
  /** How long every check must pass before auto-capture, in ms. */
  holdMs: 1000,
  /** Checks per second. Enough to feel live without draining older phones. */
  checksPerSecond: 5,
  /** After this long without passing, we suggest uploading a photo instead. */
  suggestUploadAfterMs: 20_000,
  /** Output size: short side of the uploaded JPEG. */
  outputShortSide: 1080,
  jpegQuality: 0.92,
} as const;

/** Rescans: guidance toward scan 01's light. Never blocks (DECISIONS D-011). Provisional until calibration. */
export const LIGHT_MATCH = {
  maxLuminanceDelta: 18,
  maxWarmthDelta: 0.12,
} as const;
