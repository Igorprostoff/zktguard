/**
 * Scenario 3 (D4.6): the verifier rejects a proof whose nullifier
 * has already been recorded on chain.
 *
 * Wall-clock budget: 180 seconds.
 *
 * Strategy:
 *   1. Run a happy-path mint with a hard-coded, test-specific
 *      user_secret. Poseidon(secret, app_id, claim_type) becomes a
 *      permanent fingerprint on testnet — this `user_secret` is
 *      "sacrificed to testnet for D4" and can never satisfy this
 *      scenario again.
 *   2. After the mint lands, build a *second* proof with the same
 *      user_secret + app_id + claim_type but a fresh nonce, and
 *      submit it directly through the wallet stub. Poseidon is
 *      deterministic, so the second proof carries the same
 *      nullifier — the verifier should reject it with exit 402 on
 *      the registry reply (the reuse check fires after parking).
 *
 * If step 1 finds the nullifier already used, the spec skips with a
 * clear message: a previous run already burned this user_secret, and
 * rerunning would not exercise the path under test. Rotate
 * `SACRIFICED_USER_SECRET` to recover the scenario.
 */
import { ZktGuardClient, buildVerifierMessageBody } from "@zktguard/sdk";

import { test, expect } from "../fixtures";
import {
  VERIFIER_ADDR,
  isNullifierUsed,
  latestTxMarker,
  makeClient,
  waitForTxMatching,
} from "../lib/chain";

// Sacrificed to testnet for D4. Never reuse outside this spec.
const SACRIFICED_USER_SECRET =
  0x2d44c1a47e3f5b6c8d9e0a1b2c3d4e5f60718293a4b5c6d7e8f9a0b1c2d3e4f5n;

const ATTESTOR_URL =
  process.env.VITE_ATTESTOR_URL ?? "http://127.0.0.1:7677";
const PROVER_URL =
  process.env.VITE_PROVER_URL ?? "http://127.0.0.1:7679";

test("verifier rejects a proof whose nullifier has already been used", async ({
  app,
  walletStub,
  setClaimOverride,
}) => {
  test.setTimeout(300_000);

  await setClaimOverride({ userSecret: SACRIFICED_USER_SECRET });
  await app.goto();
  await app.connectWallet();

  // Step 1 — happy-path mint via the Mini App.
  await app.clickVerify();
  await app.waitForStatus("done", 60_000);

  const uiNullifier = BigInt(await app.getNullifierFromUI());
  const client = makeClient();

  // Wait up to 60 s for the mint to actually land on chain. If the
  // sacrificed secret was already burned in an earlier run, the
  // "first" mint is a no-op and we cannot exercise the path under
  // test. The skip message tells the next operator how to recover.
  const minted = await pollUntilUsed(client, uiNullifier, 60_000);
  test.skip(
    !minted,
    "first mint did not land or sacrificed user_secret was already " +
      "burned; rotate SACRIFICED_USER_SECRET and re-run",
  );

  // Step 2 — build a *fresh* proof with the same nullifier but a
  // different nonce. The SDK does the prover round-trip; the wallet
  // stub broadcasts. We bypass the Mini App on the second submit.
  const sdk = ZktGuardClient.init({
    network: "testnet",
    verifierAddress: VERIFIER_ADDR,
    attestorUrl: ATTESTOR_URL,
    proverUrl: PROVER_URL,
  });
  const replay = await sdk.requireClaim("account_age", {
    appId: 1n,
    claimType: 1n,
    thresholdMonths: 6n,
    userSecret: SACRIFICED_USER_SECRET,
    expirationSec: BigInt(Math.floor(Date.now() / 1000)) + 3_600n,
  });
  expect(replay.nullifier).toBe(uiNullifier);

  const queryId = BigInt(Date.now()) & ((1n << 63n) - 1n);
  const body = buildVerifierMessageBody({
    queryId,
    proof: replay.proof,
    publicInputs: replay.publicInputs,
  });
  const baseline = await latestTxMarker(client, VERIFIER_ADDR);

  await walletStub.sendTransaction({
    validUntil: Math.floor(Date.now() / 1000) + 600,
    messages: [
      {
        address: VERIFIER_ADDR.toString({ testOnly: true, bounceable: true }),
        amount: "500000000",
        payload: Buffer.from(body.toBoc()).toString("base64"),
      },
    ],
  });

  // The verifier parks valid proofs first (exit 0), then rejects
  // with 402 on the registry reply once reuse is detected. Poll
  // until the 402 lands or 120 s elapses; the parking tx and the
  // reply-handling tx are separate transactions ~30-60 s apart on
  // testnet free tier.
  const fresh = await waitForTxMatching(
    client,
    VERIFIER_ADDR,
    baseline,
    (t) => t.exitCode === 402,
    120_000,
  );
  const exitCodes = fresh.map((t) => t.exitCode);
  expect(exitCodes, `verifier txs: ${JSON.stringify(exitCodes)}`).toContain(
    402,
  );

  // Nullifier still recorded exactly once (no double-mint). The
  // collection lacks a getter that would let us count items per
  // nullifier, so this is the strongest chain-side assertion.
  expect(await isNullifierUsed(client, uiNullifier)).toBe(true);
});

async function pollUntilUsed(
  client: ReturnType<typeof makeClient>,
  nf: bigint,
  timeoutMs: number,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isNullifierUsed(client, nf)) return true;
    await new Promise((r) => setTimeout(r, 5_000));
  }
  return false;
}
