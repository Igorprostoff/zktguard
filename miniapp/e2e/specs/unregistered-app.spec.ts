/**
 * Scenario 4 (D4.7): the verifier rejects a proof whose `app_id`
 * the registry does not recognise.
 *
 * Wall-clock budget: 120 seconds.
 *
 * The D1 deployment registers only `(app_id=1, claim_type=1)`. We
 * submit a proof carrying `app_id=999, claim_type=1`. The verifier
 * parks valid proofs *before* asking the registry, so we expect:
 *
 *   verifier:  verify-claim → park entry, query the registry
 *   registry:  query → reply with is_registered=false
 *   verifier:  receive reply → drop parked entry, no mint
 *
 * This is the only spec that exercises the registry's negative-reply
 * path against the live testnet deployment.
 */
import { ZktGuardClient, buildVerifierMessageBody } from "@zktguard/sdk";

import { test, expect } from "../fixtures";
import {
  REGISTRY_ADDR,
  VERIFIER_ADDR,
  isNullifierUsed,
  isParked,
  latestTxMarker,
  makeClient,
  waitForNewTxs,
} from "../lib/chain";

const ATTESTOR_URL =
  process.env.VITE_ATTESTOR_URL ?? "http://127.0.0.1:7677";
const PROVER_URL =
  process.env.VITE_PROVER_URL ?? "http://127.0.0.1:7679";

test("verifier rejects a proof for an unregistered app_id", async ({
  app,
  walletStub,
  userSecret,
}) => {
  test.setTimeout(240_000);
  await app.connectWallet();

  // We bypass the Mini App: the App config only knows about app_id=1.
  const sdk = ZktGuardClient.init({
    network: "testnet",
    verifierAddress: VERIFIER_ADDR,
    attestorUrl: ATTESTOR_URL,
    proverUrl: PROVER_URL,
  });
  const cred = await sdk.requireClaim("account_age", {
    appId: 999n,
    claimType: 1n,
    thresholdMonths: 6n,
    userSecret,
    expirationSec: BigInt(Math.floor(Date.now() / 1000)) + 3_600n,
  });

  const queryId = BigInt(Date.now()) & ((1n << 63n) - 1n);
  const body = buildVerifierMessageBody({
    queryId,
    proof: cred.proof,
    publicInputs: cred.publicInputs,
  });

  const client = makeClient();
  const verifierBaseline = await latestTxMarker(client, VERIFIER_ADDR);
  const registryBaseline = await latestTxMarker(client, REGISTRY_ADDR);

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

  // First wave: the verifier parks the proof and forwards a query
  // to the registry. We expect a successful park (exit 0) and at
  // least one new registry transaction (the query reply).
  const verifierFresh = await waitForNewTxs(
    client,
    VERIFIER_ADDR,
    verifierBaseline,
    120_000,
  );
  expect(verifierFresh.length).toBeGreaterThan(0);
  expect(verifierFresh[0].exitCode).toBe(0);

  const registryFresh = await waitForNewTxs(
    client,
    REGISTRY_ADDR,
    registryBaseline,
    120_000,
  );
  expect(registryFresh.length).toBeGreaterThan(0);

  // Second wave: the registry replied negative, the verifier dropped
  // the parked entry. Poll the parked_entry getter until it goes
  // empty, within budget. 5 s pacing to stay under rate limit.
  const deadline = Date.now() + 90_000;
  let stillParked = await isParked(client, queryId);
  while (stillParked && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 5_000));
    stillParked = await isParked(client, queryId);
  }
  expect(stillParked).toBe(false);

  // No mint happened.
  expect(await isNullifierUsed(client, cred.nullifier)).toBe(false);
});
