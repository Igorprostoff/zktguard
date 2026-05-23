#!/usr/bin/env node
/**
 * Tiny wrapper that skips the Playwright suite cleanly when
 * WALLET_STUB_MNEMONIC is not set. CI configures the secret on the
 * `test` environment; locally, copy
 * `miniapp/e2e/wallet-stub/test-wallet.env.example` into
 * `.env.local` and source it before running.
 */
const { spawnSync } = require("node:child_process");
const path = require("node:path");

const seed = process.env.WALLET_STUB_MNEMONIC;
if (!seed || seed.trim() === "") {
  console.warn(
    "[skip] WALLET_STUB_MNEMONIC not set; the e2e-testnet suite is skipped.\n" +
      "       Set it (testnet only!) before running locally, or push to main\n" +
      "       to let the CI `test` environment run it.",
  );
  process.exit(0);
}

const cfgPath = path.resolve(__dirname, "..", "e2e", "playwright.config.ts");
const args = ["playwright", "test", "--config", cfgPath, ...process.argv.slice(2)];
const r = spawnSync("pnpm", ["exec", ...args], {
  stdio: "inherit",
  env: process.env,
});
process.exit(r.status ?? 1);
