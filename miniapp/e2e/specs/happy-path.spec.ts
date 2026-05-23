/**
 * Scenario 1 (D4.4): the user verifies a valid claim and receives
 * a soulbound credential.
 *
 * Wall-clock budget: 90 seconds.
 *
 * Assertions:
 *   - the UI's nullifier-display equals the nullifier the SDK
 *     returned in the proof's public-input vector (publicInputs[0]).
 *     The proof is the source of truth; the test verifies that the
 *     UI surfaces it unchanged. The nullifier construction itself is
 *     covered by the sandbox tests in `contracts/tests/`, so the e2e
 *     spec is not re-deriving the Poseidon hash.
 *   - the verifier's `nullifier_used?` getter returns true for that
 *     value within 25 s of the Mini App reporting `done`.
 *
 * The Mini App displays the nullifier as the credential identifier
 * because the soulbound Item's address depends on the collection's
 * `next_index` and the verifier's `now()` at reply time, neither
 * predictable client-side. v0.3 will add an owner→item index.
 */
import { test, expect } from "../fixtures";
import { isNullifierUsed, makeClient } from "../lib/chain";

interface LastClaim {
  nullifier: string;
  publicInputs: string[];
}

test("user verifies a valid claim and receives a soulbound credential", async ({
  app,
  page,
}) => {
  test.setTimeout(90_000);

  await app.connectWallet();
  await app.clickVerify();

  // The Mini App walks idle → attesting → proving → submitting → done.
  // We only assert the terminal "done" because the intermediate stages
  // flash too fast for `toHaveText` polling at 100 ms.
  await app.waitForStatus("done", 60_000);

  const lastClaim = (await page.evaluate(
    () =>
      (window as unknown as Record<string, unknown>)[
        "__ZKTGUARD_LAST_CLAIM__"
      ],
  )) as LastClaim | undefined;
  expect(lastClaim, "flow.ts should have written __ZKTGUARD_LAST_CLAIM__")
    .toBeDefined();
  const proofNullifier = BigInt(lastClaim!.publicInputs[0]);

  const uiNullifier = await app.getNullifierFromUI();
  expect(uiNullifier).toMatch(/^0x[0-9a-f]+$/);
  expect(BigInt(uiNullifier)).toBe(proofNullifier);

  // Now confirm the chain has recorded the mint. The verifier mints
  // only after the registry replies; we poll for up to ~25 s, leaving
  // headroom inside the 90 s budget.
  const client = makeClient();
  const deadline = Date.now() + 25_000;
  let used = false;
  while (Date.now() < deadline) {
    if (await isNullifierUsed(client, proofNullifier)) {
      used = true;
      break;
    }
  }
  expect(used).toBe(true);
});
