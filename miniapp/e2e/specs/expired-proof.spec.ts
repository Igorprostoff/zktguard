/**
 * Scenario 2 (D4.5): the verifier rejects a proof whose `expiration`
 * public input is in the past.
 *
 * Wall-clock budget: 60 seconds.
 *
 * The Mini App's normal flow always emits a *fresh* expiration, so
 * this spec bypasses the Mini App and submits the verify-claim
 * directly through the wallet stub. We start from the Phase-A
 * accept fixture, tamper its expiration to `now - 3600`, and rebuild
 * the verifier message body. The verifier checks expiration before
 * the pairing check (see groth16_verifier.fc line 401), so the
 * tampered public input triggers exit 403 cleanly without ever
 * touching the pairing engine.
 */
import * as fs from "node:fs";
import * as path from "node:path";

import { buildVerifierMessageBody } from "@zktguard/sdk";

import { test, expect } from "../fixtures";
import {
  VERIFIER_ADDR,
  isNullifierUsed,
  isParked,
  latestTxMarker,
  makeClient,
  waitForNewTxs,
} from "../lib/chain";

interface Fixture {
  aHex: string;
  bHex: string;
  cHex: string;
  publicInputs: string[];
}

const FIXTURE_PATH = path.resolve(
  __dirname,
  "..",
  "..",
  "..",
  "contracts",
  "tests",
  "fixtures",
  "phase_a_accept.json",
);

test("verifier rejects a proof with an expiration in the past", async ({
  app,
  walletStub,
}) => {
  test.setTimeout(60_000);
  await app.connectWallet();

  const fixture = JSON.parse(fs.readFileSync(FIXTURE_PATH, "utf8")) as Fixture;
  const pi = fixture.publicInputs.map((s) => BigInt(s));
  // pi[3] is expiration. Tamper to one hour in the past.
  pi[3] = BigInt(Math.floor(Date.now() / 1000)) - 3_600n;

  const queryId = BigInt(Date.now()) & ((1n << 63n) - 1n);
  const body = buildVerifierMessageBody({
    queryId,
    proof: { aHex: fixture.aHex, bHex: fixture.bHex, cHex: fixture.cHex },
    publicInputs: pi,
  });
  const bocB64 = Buffer.from(body.toBoc()).toString("base64");

  const client = makeClient();
  const baseline = await latestTxMarker(client, VERIFIER_ADDR);
  const fixtureNullifier = pi[0];
  const usedBefore = await isNullifierUsed(client, fixtureNullifier);

  await walletStub.sendTransaction({
    validUntil: Math.floor(Date.now() / 1000) + 600,
    messages: [
      {
        address: VERIFIER_ADDR.toString({ testOnly: true, bounceable: true }),
        amount: "500000000",
        payload: bocB64,
      },
    ],
  });

  const fresh = await waitForNewTxs(client, VERIFIER_ADDR, baseline, 45_000);
  expect(fresh.length).toBeGreaterThan(0);
  const exitCodes = fresh.map((t) => t.exitCode);
  expect(exitCodes).toContain(403);

  // Pre-pairing reject means no parked entry was written.
  expect(await isParked(client, queryId)).toBe(false);
  // Nullifier state must be unchanged.
  expect(await isNullifierUsed(client, fixtureNullifier)).toBe(usedBefore);
});
