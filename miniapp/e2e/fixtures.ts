/**
 * Playwright fixtures shared by every spec.
 *
 * Each test gets:
 *   - `app`              — the page object (querying by data-testid)
 *   - `walletStub`       — the Node-side WalletStub bound to the test wallet
 *   - `userSecret`       — deterministic-from-test-title 256-bit secret
 *   - `expectedNullifier`— Poseidon(userSecret, app_id, claim_type) for that
 *                          test, expressed as a 0x-hex string matching the
 *                          UI's nullifier-display
 *
 * The wallet stub is installed before the Mini App's bundle runs via
 * `addInitScript` + a `__stubSendTransaction` page-side function.
 */
import { test as baseTest, expect } from "@playwright/test";
import { createHash } from "node:crypto";

import { WalletStub } from "./wallet-stub/src/index";
import { MiniAppPage } from "./pages/MiniAppPage";

const STUB_GLOBAL_NAME = "__TONCONNECT_TEST_STUB__";
const SEND_BRIDGE_NAME = "__stubSendTransaction";

// Per-process salt so nullifiers do not collide between local runs of
// the same spec. CI may override via env so a tagged release pins the
// nullifier vector for reproducibility.
const RUN_SALT =
  process.env.E2E_RUN_SALT ??
  Math.floor(Date.now() / 1000).toString(16);

interface E2EFixtures {
  app: MiniAppPage;
  walletStub: WalletStub;
  userSecret: bigint;
  expectedNullifier: bigint;
}

export const test = baseTest.extend<E2EFixtures>({
  walletStub: async ({}, use) => {
    const mnemonic = process.env.WALLET_STUB_MNEMONIC;
    if (!mnemonic) {
      throw new Error(
        "WALLET_STUB_MNEMONIC required for e2e fixtures; the test runner " +
          "should have skipped the suite before reaching this point.",
      );
    }
    const stub = await WalletStub.create({ mnemonic });
    await use(stub);
  },

  userSecret: async ({}, use, testInfo) => {
    const hash = createHash("sha256");
    hash.update(testInfo.title);
    hash.update(RUN_SALT);
    const bytes = hash.digest();
    // 254-bit value to stay safely inside the BLS12-381 scalar field.
    bytes[0] &= 0x3f;
    const hex = "0x" + bytes.toString("hex");
    await use(BigInt(hex));
  },

  expectedNullifier: async ({ userSecret }, use) => {
    // Poseidon over BN254 — circomlibjs hash is field-correct for our
    // research-grade circuit. Loaded lazily so suites that don't need
    // it (e.g. expired-proof, unregistered-app) skip the cost.
    // @ts-expect-error circomlibjs has no published types
    const { buildPoseidon } = await import("circomlibjs");
    const poseidon = await buildPoseidon();
    const n = poseidon.F.toObject(poseidon([userSecret, 1n, 1n]));
    await use(n as bigint);
  },

  app: async ({ page, walletStub }, use) => {
    const info = walletStub.walletInfo();

    // Bridge: page-side calls `window.__stubSendTransaction(req)` and
    // the Node process performs the real send through the stub.
    await page.exposeFunction(SEND_BRIDGE_NAME, async (req: unknown) => {
      return walletStub.sendTransaction(
        req as Parameters<WalletStub["sendTransaction"]>[0],
      );
    });

    // Glue runs before any app script.
    await page.addInitScript(
      ({ globalName, bridgeName, address, publicKey }) => {
        (window as unknown as Record<string, unknown>)[globalName] = {
          address,
          publicKey,
          sendTransaction: (req: unknown) =>
            (window as unknown as Record<string, (req: unknown) => unknown>)[
              bridgeName
            ](req),
        };
      },
      {
        globalName: STUB_GLOBAL_NAME,
        bridgeName: SEND_BRIDGE_NAME,
        address: info.address,
        publicKey: info.publicKey,
      },
    );

    const app = new MiniAppPage(page);
    await app.goto();
    await use(app);
  },
});

export { expect };
