import "server-only";
import { features } from "@/lib/env";
import { localObjectStorage, localStore } from "./local";
import { supabaseObjectStorage, supabaseStore } from "./supabase";
import type { ObjectStorage, Store } from "./types";

export type { ObjectStorage, Store } from "./types";

/**
 * Supabase when its keys are set, otherwise the local file store (DECISIONS D-017).
 * On a Vercel deploy without keys, a banner says data may reset.
 */
export function getStore(): Store {
  return features.supabase ? supabaseStore : localStore;
}

export function getStorage(): ObjectStorage {
  return features.supabase ? supabaseObjectStorage : localObjectStorage;
}

export function isEphemeralStore(): boolean {
  return getStore().kind === "local" && Boolean(process.env.VERCEL);
}

export { features };
