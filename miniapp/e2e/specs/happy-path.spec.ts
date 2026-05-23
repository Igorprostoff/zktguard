/**
 * Scenario 1 (D4.4): the user verifies a valid claim and receives
 * a soulbound credential.
 *
 * Wall-clock budget: 90 seconds.
 *
 * Independent assertion (does not depend on the on-chain mint
 * landing, which lags the UI by tens of seconds):
 *   - the UI's nullifier-display matches Poseidon(secret, 1, 1)
 *
 * Cross-chain assertion (polled within budget):
 *   - the verifier's `nullifier_used?` getter returns true for the
 *     same nullifier
 *
 * The Mini App displays the nullifier as the credential identifier
 * because the soulbound Item's address depends on the collection's
 * `next_index` and the verifier's `now()` at reply time, neither
 * predictable client-side. v0.3 will add an owner→item index.
 */
import { test, expect } from "../fixtures";
import { isNullifierUsed, makeClient } from "../lib/chain";

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
  // only after the registry replies; we poll for up to ~25 s, leaving
  // headroom inside the 90 s budget.
  const client = makeClient();
  const deadline = Date.now() + 25_000;
  let used = false;
  while (Date.now() < deadline) {
    if (await isNullifierUsed(client, expectedNullifier)) {
      used = true;
      break;
    }
  }
  expect(used).toBe(true);
});
