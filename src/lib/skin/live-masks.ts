import "server-only";
// Copies YouCam's detection masks into our storage (their links expire after about 2 hours).
// Each mask is redrawn as white-on-transparent in the stored photo's exact proportions,
// so the report tints it like every other mask and it lines up with the photo.

import sharp from "sharp";
import { env } from "@/lib/env";

const DOWNLOAD_TIMEOUT_MS = 15_000;
const MAX_MASK_BYTES = 20 * 1024 * 1024;
/** Masks are stretched over the photo, so more pixels than this add nothing but memory. */
const MAX_MASK_SIDE = 1440;

/** The mask size for a photo: same proportions, long side at most MAX_MASK_SIDE. */
export function maskSize(width: number, height: number): { width: number; height: number } {
  const scale = Math.min(1, MAX_MASK_SIDE / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

async function download(url: string): Promise<Buffer> {
  const protocol = new URL(url).protocol;
  // Masks come from YouCam's signed HTTPS links. Plain HTTP only when tests point at a local stand-in.
  if (protocol !== "https:" && !(protocol === "http:" && env.YOUCAM_API_BASE.startsWith("http:"))) {
    throw new Error(`refusing a non-HTTPS mask link`);
  }
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS), cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const bytes = Buffer.from(await res.arrayBuffer());
      if (bytes.length > MAX_MASK_BYTES) throw new Error(`mask is ${bytes.length} bytes`);
      return bytes;
    } catch (error) {
      if (attempt >= 1) throw error;
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
  }
}

/**
 * The mask's shape as one 8-bit channel at width × height.
 * YouCam's raw masks carry the shape in alpha. If a mask is opaque everywhere, brightness carries it instead.
 */
export async function maskAlpha(image: Buffer, width: number, height: number): Promise<Buffer> {
  const meta = await sharp(image).metadata();
  let useAlpha = Boolean(meta.hasAlpha);
  if (useAlpha) {
    const stats = await sharp(image).stats();
    useAlpha = stats.channels[stats.channels.length - 1].min < 255;
  }
  const channel = useAlpha
    ? sharp(image).ensureAlpha().extractChannel("alpha")
    : sharp(image).flatten({ background: "#000000" }).greyscale().extractChannel(0);
  return channel.resize(width, height, { fit: "fill" }).raw().toBuffer();
}

/** White marks on transparent, from one or more masks (combined where a concern has several). */
export async function overlayMask(images: Buffer[], width: number, height: number): Promise<Buffer> {
  const alphas = await Promise.all(images.map((img) => maskAlpha(img, width, height)));
  const alpha = alphas[0];
  for (const other of alphas.slice(1)) {
    for (let i = 0; i < alpha.length; i++) if (other[i] > alpha[i]) alpha[i] = other[i];
  }
  return sharp({ create: { width, height, channels: 3, background: { r: 255, g: 255, b: 255 } } })
    .joinChannel(alpha, { raw: { width, height, channels: 1 } })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/** Downloads a concern's masks and returns one PNG in the stored photo's proportions. */
export async function copyLiveMask(urls: string[], photoWidth: number, photoHeight: number): Promise<Buffer> {
  const { width, height } = maskSize(photoWidth, photoHeight);
  return overlayMask(await Promise.all(urls.map(download)), width, height);
}
