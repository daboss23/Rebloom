// Fails if any source file contains an em dash (brief 7.7). Run with `pnpm check:copy`.
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const roots = ["src"];
const exts = new Set([".ts", ".tsx", ".css", ".md"]);
let failures = 0;

async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(p);
    else if (exts.has(path.extname(p))) {
      const lines = (await readFile(p, "utf8")).split("\n");
      lines.forEach((line, i) => {
        if (line.includes("\u2014")) {
          failures++;
          console.log(`${p}:${i + 1}: em dash`);
        }
      });
    }
  }
}
for (const r of roots) await walk(r);
if (failures) {
  console.log(`${failures} em dash(es) found. Use a full stop, comma or "·" instead.`);
  process.exit(1);
}
console.log("Copy check passed: no em dashes.");
