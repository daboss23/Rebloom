import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

// Live mode end to end: the app runs with YOUCAM_MODE=live against a local stand-in for YouCam
// (tests/e2e/mock-youcam.mjs) that follows the recorded v2.1 wire format. No real units are spent.
const port = Number(process.env.E2E_LIVE_PORT ?? 3201);
const mockPort = 3299;

export default defineConfig({
  ...base,
  testIgnore: undefined,
  testMatch: /live\.spec\.ts$/,
  use: { ...base.use, baseURL: `http://localhost:${port}` },
  webServer: [
    {
      command: "node tests/e2e/mock-youcam.mjs",
      url: `http://localhost:${mockPort}/__mock/health`,
      reuseExistingServer: false,
      env: { MOCK_YOUCAM_PORT: String(mockPort), MOCK_YOUCAM_KEY: "e2e-key" },
    },
    {
      // A fresh data folder each run, so per-browser limits and the unit ledger start from zero.
      command: `node -e "require('fs').rmSync('.data/e2e-live',{recursive:true,force:true})" && pnpm dev --port ${port}`,
      url: `http://localhost:${port}/c/maison-verre`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        REBLOOM_DATA_DIR: ".data/e2e-live",
        YOUCAM_MODE: "live",
        YOUCAM_API_KEY: "e2e-key",
        YOUCAM_API_BASE: `http://localhost:${mockPort}`,
        CRON_SECRET: "e2e-cron-secret",
        FIXTURE_DELAY_MS: "1500",
      },
    },
  ],
});
