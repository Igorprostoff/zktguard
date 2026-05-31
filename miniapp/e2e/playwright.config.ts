import { defineConfig } from "@playwright/test";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

// `__dirname` is undefined under Node's native ESM loader. Derive it
// from `import.meta.url` so the config works whether Playwright loads
// the file as ESM or transpiles it to CJS.
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:5173";
const isCI = !!process.env.CI;

// Wall-clock budget per spec (from the D4 plan):
//   happy-path        90s
//   expired-proof     60s
//   replayed-nullifier 180s
//   unregistered-app  120s
// We give the suite 240s per test so the long ones have headroom.

export default defineConfig({
  testDir: path.join(__dirname, "specs"),
  fullyParallel: false,
  workers: 1, // testnet rate-limit makes parallelism counterproductive
  timeout: 240_000,
  // One retry handles transient toncenter 500 waves that eat the
  // polling window. The chain logic is correct; failures are timing-
  // shaped, not code-shaped.
  retries: isCI ? 1 : 0,
  forbidOnly: isCI,
  reporter: isCI
    ? [["github"], ["html", { open: "never", outputFolder: path.join(__dirname, "..", "..", "playwright-report") }]]
    : [["list"], ["html", { open: "on-failure", outputFolder: path.join(__dirname, "..", "..", "playwright-report") }]],
  outputDir: path.join(__dirname, "..", "..", "test-results"),
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    video: "retain-on-failure",
    actionTimeout: 30_000,
    navigationTimeout: 30_000,
  },
  projects: [
    {
      name: "chromium",
      use: {
        browserName: "chromium",
        viewport: { width: 480, height: 800 },
      },
    },
  ],
  webServer: {
    command: "pnpm --filter @zktguard/miniapp dev -- --port 5173",
    url: BASE_URL,
    reuseExistingServer: !isCI,
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
