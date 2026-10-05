// Exports web-sized logo files and app icons from the originals in /brand.
// Run with `pnpm assets:brand` after a logo changes. Outputs are committed.
import sharp from "sharp";
import { mkdir } from "node:fs/promises";

const PORCELAIN = { r: 0xf7, g: 0xf4, b: 0xef, alpha: 1 };
const out = "public/brand/maison-verre";
await mkdir(out, { recursive: true });

await sharp("brand/mv-lockup.png").resize({ width: 800 }).png({ compressionLevel: 9 }).toFile(`${out}/lockup.png`);
await sharp("brand/mv-lockup-no-tagline.png").resize({ width: 640 }).png({ compressionLevel: 9 }).toFile(`${out}/lockup-no-tagline.png`);
await sharp("brand/mv-monogram.png").resize({ height: 120 }).png({ compressionLevel: 9 }).toFile(`${out}/monogram.png`);

// App icons: the monogram centred on a porcelain square, so it keeps contrast on dark tabs.
async function icon(size, file, pad = 0.18) {
  const inner = Math.round(size * (1 - pad * 2));
  const mark = await sharp("brand/mv-monogram.png").resize({ width: inner, height: inner, fit: "inside" }).toBuffer();
  await sharp({ create: { width: size, height: size, channels: 4, background: PORCELAIN } })
    .composite([{ input: mark, gravity: "center" }])
    .png({ compressionLevel: 9 })
    .toFile(file);
}
await icon(512, `${out}/icon-512.png`);
await icon(64, "src/app/icon.png", 0.1);
await icon(180, "src/app/apple-icon.png");
console.log("Brand assets written.");
