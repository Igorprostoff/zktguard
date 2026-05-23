/**
 * Phase D1 sanity check: end-to-end verify-claim against the live
 * testnet deployment.
 *
 *   1. Load the v0.2 Phase-A proof fixture (real BLS12-381 Groth16
 *      proof, generated against the committed VK).
 *   2. Build the verifier message body via the SDK helper.
 *   3. Send it from the deployer wallet to the deployed verifier on
 *      testnet.
 *   4. Poll the verifier:
 *      - parked_entry(query_id=1) flips to present after the verify tx.
 *      - nullifier_used?(nullifier) flips to true after the registry
 *        reply lands.
 *   5. Record the four on-chain tx hashes (verify+park, registry
 *      query, registry reply, mint) into `sanity-check.json`.
 *
 * The fixture's nonce already packs chain_id=1 in its high 32 bits,
 * so it works against testnet without modification. The mint
 * destination is the deployer wallet (= original_sender at park time).
 */
import * as fs from "node:fs";
import * as path from "node:path";

import {
  Address,
  beginCell,
  internal,
  SendMode,
  toNano,
  TonClient,
  WalletContractV5R1,
  TupleItem,
} from "@ton/ton";
import { mnemonicToPrivateKey } from "@ton/crypto";

import { throttled } from "../lib/throttle";

const TESTNET_ENDPOINT = "https://testnet.toncenter.com/api/v2/jsonRPC";

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

interface Deployment {
  registry: { address: string; tx: string };
  collection: { address: string; tx: string };
  verifier: { address: string; tx: string };
  wiring: Record<string, string>;
  deployer: string;
  commit: string;
}

interface Fixture {
  aHex: string;
  bHex: string;
  cHex: string;
  publicInputs: string[];
}

function buildPointCell(bytes: Buffer) {
  let b = beginCell();
  for (const byte of bytes) b = b.storeUint(byte, 8);
  return b.endCell();
}

function buildVerifyBody(fixture: Fixture, queryId: bigint) {
  const pi = fixture.publicInputs.map((s) => BigInt(s));
  const c2 = beginCell()
    .storeUint(pi[6], 256)
    .storeUint(pi[7], 256)
    .endCell();
  const c1 = beginCell()
    .storeUint(pi[3], 256)
    .storeUint(pi[4], 256)
    .storeUint(pi[5], 256)
    .storeRef(c2)
    .endCell();
  const piHead = beginCell()
    .storeUint(pi[0], 256)
    .storeUint(pi[1], 256)
    .storeUint(pi[2], 256)
    .storeRef(c1)
    .endCell();
  return beginCell()
    .storeUint(0x76657266, 32) // op::verify_claim
    .storeUint(queryId, 64)
    .storeRef(buildPointCell(Buffer.from(fixture.aHex, "hex")))
    .storeRef(buildPointCell(Buffer.from(fixture.bHex, "hex")))
    .storeRef(buildPointCell(Buffer.from(fixture.cHex, "hex")))
    .storeRef(piHead)
    .endCell();
}

async function main(): Promise<void> {
  const repoRoot = path.resolve(__dirname, "..", "..");
  const deployment: Deployment = JSON.parse(
    fs.readFileSync(path.join(repoRoot, "contracts", "deployments", "v0.2-testnet.json"), "utf8"),
  );
  const fixture: Fixture = JSON.parse(
    fs.readFileSync(path.join(repoRoot, "contracts", "tests", "fixtures", "phase_a_accept.json"), "utf8"),
  );

  const mnemonic = process.env.WALLET_MNEMONIC;
  if (!mnemonic) throw new Error("WALLET_MNEMONIC required");
  const words = mnemonic.split(/\s+/).filter(Boolean);
  const keypair = await mnemonicToPrivateKey(words);
  const wallet = WalletContractV5R1.create({ workchain: 0, publicKey: keypair.publicKey });

  const client = new TonClient({
    endpoint: process.env.TON_ENDPOINT ?? TESTNET_ENDPOINT,
    apiKey: process.env.TONCENTER_API_KEY,
  });
  const walletContract = client.open(wallet);

  const verifierAddr = Address.parse(deployment.verifier.address);
  const registryAddr = Address.parse(deployment.registry.address);
  const collectionAddr = Address.parse(deployment.collection.address);
  const nullifier = BigInt(fixture.publicInputs[0]);

  console.log(`deployer: ${wallet.address.toString({ testOnly: true })}`);
  console.log(`verifier: ${verifierAddr.toString({ testOnly: true })}`);
  console.log(`registry: ${registryAddr.toString({ testOnly: true })}`);
  console.log(`collection: ${collectionAddr.toString({ testOnly: true })}`);
  console.log(`nullifier: 0x${nullifier.toString(16)}`);

  const balance = await throttled(() => client.getBalance(wallet.address));
  console.log(`balance: ${Number(balance) / 1e9} TON`);
  if (balance < toNano("0.6")) throw new Error("balance below 0.6 TON; top up to send verify-claim");

  // Use queryId=1 because next_query_id starts at 1; this picks up the
  // first parked slot on the deployed verifier.
  const localQueryId = 100n; // wallet-side message identifier (cosmetic)
  const seqno = await throttled(() => walletContract.getSeqno());

  const verifyBody = buildVerifyBody(fixture, localQueryId);
  console.log("\nsending op::verify_claim…");
  await throttled(() =>
    walletContract.sendTransfer({
      seqno,
      secretKey: keypair.secretKey,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      messages: [
        internal({
          to: verifierAddr,
          value: toNano("0.5"),
          bounce: true,
          body: verifyBody,
        }),
      ],
    }),
  );
  console.log("  sent. waiting for confirmation…");

  // Wait for seqno bump.
  for (let i = 0; i < 30; i++) {
    const cur = await throttled(() => walletContract.getSeqno());
    if (cur > seqno) break;
    await sleep(3_000);
  }

  // Poll the verifier's get methods.
  let parked = false;
  let used = false;
  let parkObserved = false;
  for (let i = 0; i < 60; i++) {
    const parkedRes = await throttled(() =>
      client.runMethod(verifierAddr, "parked_entry", [
        { type: "int", value: 1n } as TupleItem,
      ]),
    );
    parked = parkedRes.stack.readNumber() !== 0;
    if (parked && !parkObserved) {
      console.log(`  [t+${i * 5}s] parked_entry(1) = true`);
      parkObserved = true;
    }
    const usedRes = await throttled(() =>
      client.runMethod(verifierAddr, "nullifier_used?", [
        { type: "int", value: nullifier } as TupleItem,
      ]),
    );
    used = usedRes.stack.readNumber() !== 0;
    if (used) {
      console.log(`  [t+${i * 5}s] nullifier_used?(...) = true (mint complete)`);
      break;
    }
    await sleep(5_000);
  }
  if (!parkObserved) console.warn("  parked entry never observed");
  if (!used) console.warn("  nullifier never marked used");

  // Read the verifier's latest transactions to capture the four
  // expected hops (verify, query, reply, mint).
  const recent = await throttled(() => client.getTransactions(verifierAddr, { limit: 20 }));
  const verifyTx = recent.find((t) => {
    const op = t.inMessage?.body?.beginParse?.()?.loadUint(32);
    return op === 0x76657266;
  });
  const replyTx = recent.find((t) => {
    const op = t.inMessage?.body?.beginParse?.()?.loadUint(32);
    return op === 0x7172706c;
  });
  // Collection mint tx: find verifier's outgoing message to collection
  const collectionRecent = await throttled(() =>
    client.getTransactions(collectionAddr, { limit: 20 }),
  );
  const mintTx = collectionRecent.find((t) => {
    const op = t.inMessage?.body?.beginParse?.()?.loadUint(32);
    return op === 0x6d696e74;
  });
  const registryRecent = await throttled(() =>
    client.getTransactions(registryAddr, { limit: 20 }),
  );
  const queryTx = registryRecent.find((t) => {
    const op = t.inMessage?.body?.beginParse?.()?.loadUint(32);
    return op === 0x71726567;
  });

  const out = {
    deployer: wallet.address.toString({ testOnly: true }),
    verify_tx: verifyTx?.hash?.().toString("hex") ?? null,
    registry_query_tx: queryTx?.hash?.().toString("hex") ?? null,
    registry_reply_tx: replyTx?.hash?.().toString("hex") ?? null,
    mint_tx: mintTx?.hash?.().toString("hex") ?? null,
    nullifier: "0x" + nullifier.toString(16),
    parked_observed: parkObserved,
    nullifier_recorded: used,
  };
  const outPath = path.join(repoRoot, "contracts", "deployments", "sanity-check.json");
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2) + "\n");
  console.log(`\nwrote ${outPath}`);
}

main().catch((e) => {
  console.error("sanity-check failed:", e);
  process.exit(1);
});
