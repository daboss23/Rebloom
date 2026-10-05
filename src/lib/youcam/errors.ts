// Friendly retry copy for YouCam image errors (brief 6.2). One calm instruction each.
// Codes are YouCam's task errors, plus a few of our own for the pipeline itself.
export interface FriendlyError {
  title: string;
  instruction: string;
  retake: boolean;
}

const MAP: Record<string, FriendlyError> = {
  error_src_face_too_small: {
    title: "Your face was a little too far away.",
    instruction: "Hold the phone a bit closer, so your face fills the oval.",
    retake: true,
  },
  error_src_face_out_of_bound: {
    title: "Part of your face was outside the photo.",
    instruction: "Center your face in the oval, with a little space around it.",
    retake: true,
  },
  error_lighting_dark: {
    title: "The light was too low for a reliable reading.",
    instruction: "Face a window or a bright, even light, then try again.",
    retake: true,
  },
  error_below_min_image_size: {
    title: "The photo was too small for a reliable reading.",
    instruction: "Try the camera again, or upload a larger photo.",
    retake: true,
  },
  error_exceed_max_image_size: {
    title: "The photo was too large to read.",
    instruction: "Try the camera again, or upload a smaller photo.",
    retake: true,
  },
  error_no_face: {
    title: "We couldn't find a face in your photo.",
    instruction: "Face the camera straight on, with your whole face inside the oval.",
    retake: true,
  },
  error_pose: {
    title: "Your head was turned a little.",
    instruction: "Look straight at the camera, chin level, then try again.",
    retake: true,
  },
  error_face_parsing: {
    title: "Part of your face was hard to read.",
    instruction: "Move hair away from your forehead, take off glasses, and try again in even light.",
    retake: true,
  },
  error_nsfw_content_detected: {
    title: "We couldn't use this photo.",
    instruction: "Please take a new photo of your face only, against a plain background.",
    retake: true,
  },
  analysis_timeout: {
    title: "Your reading took longer than it should.",
    instruction: "Nothing is wrong with your photo. Please try once more.",
    retake: true,
  },
};

const GENERIC: FriendlyError = {
  title: "We couldn't finish reading your photo.",
  instruction: "This happens occasionally. Please try once more.",
  retake: true,
};

export function friendlyError(code: string | null | undefined): FriendlyError {
  return (code && MAP[code]) || GENERIC;
}
