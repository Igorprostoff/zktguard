/**
 * Scenario 1 (D4.4): the user verifies a valid claim and receives
 * a soulbound credential.
 *
 * Wall-clock budget: 90 seconds.
 *
 * Independent assertions (independent of the on-chain mint, which
 * lags the UI by tens of seconds):
 *  - the UI's nullifier-display matches Poseidon(secret, 1, 1)
 *
 * Cross-chain assertions (poll until they pass, within budget):
 *  - the verifier's `nullifier_used?` getter returns true for the
 *    same nullifier
 */
import { TonClient, Address } from "@ton/ton";

import { test, expect } from "../fixtures";
import deployment from "../../../contracts/deployments/v0.2-testnet.json";
import { throttled } from "../../../contracts/lib/throttle";

const VERIFIER_ADDR = deployment.verifier.address;
const TESTNET_ENDPOINT =
  process.env.TON_TESTNET_ENDPOINT ??
  "https://testnet.toncenter.com/api/v2/jsonRPC";

test("user verifies a valid claim and receives a soulbound credential", async ({
  app,
  expectedNullifier,
}) => {
  test.setTimeout(90_000);

  await app.connectWallet();
  await app.clickVerify();

  // The Mini App walks idle → attesting → proving → submitting → done.
  // We only assert the terminal "done" because the intermediate stages
  // flash too fast for `toHaveText` polling at 100 ms.
  await app.waitForStatus("done", 60_000);

  const uiNullifier = await app.getNullifierFromUI();
  expect(uiNullifier).toMatch(/^0x[0-9a-f]+$/);
  expect(BigInt(uiNullifier)).toBe(expectedNullifier);

  // Now confirm the chain has recorded the mint. The verifier mints
  // the soulbound item only after the registry replies; we poll for up
  // to ~25 s, leaving headroom inside the 90 s budget.
  const client = new TonClient({
    endpoint: TESTNET_ENDPOINT,
    apiKey: process.env.TONCENTER_API_KEY,
  });
  const verifierAddr = Address.parse(VERIFIER_ADDR);

  const deadline = Date.now() + 25_000;
  let used = false;
  while (Date.now() < deadline) {
    const res = await throttled(() =>
      client.runMethod(verifierAddr, "nullifier_used?", [
        { type: "int", value: expectedNullifier },
      ]),
    );
    if (res.stack.readNumber() !== 0) {
      used = true;
      break;
    }
  }
  expect(used).toBe(true);
});
