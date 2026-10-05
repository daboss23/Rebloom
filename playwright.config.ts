import { defineConfig, devices } from "@playwright/test";

// Runs the client flow against a local server in no-keys mode.
// In the Claude cloud workspace, set PW_CHROMIUM_PATH=/opt/pw-browsers/chromium.
const port = Number(process.env.E2E_PORT ?? 3200);

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  fullyParallel: false,
  use: {
    baseURL: `http://localhost:${port}`,
    ...devices["Pixel 7"],
    launchOptions: {
      executablePath: process.env.PW_CHROMIUM_PATH || undefined,
      args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
    },
    permissions: ["camera"],
  },
  webServer: {
    command: `pnpm dev --port ${port}`,
    url: `http://localhost:${port}/c/maison-verre`,
    reuseExistingServer: true,
    timeout: 120_000,
    env: { REBLOOM_DATA_DIR: ".data/e2e", FIXTURE_DELAY_MS: "1500" },
  },
});
