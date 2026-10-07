// Prepares the demo portraits (DECISIONS D-030): crops each picture to 3:4 around the face's usual place,
// resizes to 1080 × 1440, strips metadata, and writes public/demo-portraits/<name>.jpg.
//   node scripts/portraits.mjs <picture> <name> [<picture> <name> ...]
// Names are the demo clients' first names in lower case: amelia, priya, marcus, sofia, grace, hannah,
// olivia, daniel, nina, chloe, isabel, rachel.
import { mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const NAMES = ["amelia", "priya", "marcus", "sofia", "grace", "hannah", "olivia", "daniel", "nina", "chloe", "isabel", "rachel"];
const out = path.resolve("public/demo-portraits");
const args = process.argv.slice(2);
if (args.length === 0 || args.length % 2) {
  console.error("Usage: node scripts/portraits.mjs <picture> <name> [<picture> <name> ...]");
  process.exit(1);
}
await mkdir(out, { recursive: true });
for (let i = 0; i < args.length; i += 2) {
  const [file, name] = [args[i], args[i + 1].toLowerCase()];
  if (!NAMES.includes(name)) throw new Error(`"${name}" isn't a demo client. Use one of: ${NAMES.join(", ")}.`);
  // "attention" keeps the most detailed region, the face, when the picture is wider than 3:4.
  const info = await sharp(file)
    .rotate()
    .resize(1080, 1440, { fit: "cover", position: sharp.strategy.attention })
    .jpeg({ quality: 84, mozjpeg: true })
    .toFile(path.join(out, `${name}.jpg`));
  console.log(`${name}.jpg  ${info.width} × ${info.height}  ${Math.round(info.size / 1024)} KB`);
}
