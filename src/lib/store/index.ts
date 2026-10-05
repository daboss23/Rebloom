import "server-only";
import { features } from "@/lib/env";
import { localObjectStorage, localStore } from "./local";
import type { ObjectStorage, Store } from "./types";

export type { ObjectStorage, Store } from "./types";

/**
 * The Supabase implementation is wired in once keys are available (PLAN.md, after "keys are in").
 * Until then every environment uses the local store, and a banner says so on Vercel.
 */
export function getStore(): Store {
  return localStore;
}

export function getStorage(): ObjectStorage {
  return localObjectStorage;
}

export function isEphemeralStore(): boolean {
  return getStore().kind === "local" && Boolean(process.env.VERCEL);
}

export { features };
