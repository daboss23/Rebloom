// Receives direct photo uploads in no-keys mode, mirroring Supabase's signed upload URLs.
import { features } from "@/lib/env";
import { getStorage } from "@/lib/store";
import { verifyLocal } from "@/lib/store/local";

const MAX_BYTES = 8 * 1024 * 1024;

export async function PUT(request: Request) {
  if (features.supabase) return new Response("Not found", { status: 404 });
  const url = new URL(request.url);
  const path = url.searchParams.get("path") ?? "";
  const exp = Number(url.searchParams.get("exp"));
  const sig = url.searchParams.get("sig") ?? "";
  if (!verifyLocal("PUT", path, exp, sig)) return new Response("Link expired", { status: 403 });
  if (request.headers.get("content-type") !== "image/jpeg") return new Response("JPEG only", { status: 415 });
  const bytes = Buffer.from(await request.arrayBuffer());
  if (bytes.length === 0 || bytes.length > MAX_BYTES) return new Response("Bad size", { status: 413 });
  // JPEG files start with FF D8 FF.
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) return new Response("Not a JPEG", { status: 415 });
  await getStorage().put(path, bytes, "image/jpeg");
  return new Response(null, { status: 204 });
}
