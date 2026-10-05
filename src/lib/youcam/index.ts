import "server-only";
import { features } from "@/lib/env";
import { fixtureProvider } from "./fixture";
import { liveProvider } from "./live";
import type { SkinAnalysisProvider } from "./types";

export function getProvider(mode: "live" | "fixture"): SkinAnalysisProvider {
  return mode === "live" && features.youcamLive ? liveProvider : fixtureProvider;
}
