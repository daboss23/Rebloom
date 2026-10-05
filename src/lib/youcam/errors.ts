// Friendly retry copy for YouCam image errors (brief 6.2). One calm instruction each.
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
};

const GENERIC: FriendlyError = {
  title: "We couldn't finish reading your photo.",
  instruction: "This happens occasionally. Please try once more.",
  retake: true,
};

export function friendlyError(code: string | null | undefined): FriendlyError {
  return (code && MAP[code]) || GENERIC;
}
