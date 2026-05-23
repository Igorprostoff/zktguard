/**
 * Direct testnet deployment for the v0.2 Phase D1 release.
 *
 * Reads `WALLET_MNEMONIC` from the environment, derives a v4R2 wallet
 * (override with `WALLET_VERSION=v3R2 | v5R1` if needed), then drives
 * the seven-step Phase D1 sequence:
 *
 *   1. Deploy AppRegistry
 *   2. Deploy SoulboundCollection (with deployer as placeholder verifier)
 *   3. Deploy Groth16Verifier (registry + collection set in init data)
 *   4. set_collection — verifier learns the collection address
 *   5. set_registry   — verifier learns the registry address
 *      (steps 4 + 5 may be no-ops because the verifier already had
 *      both addresses in its stateInit; the script still emits the
 *      transactions for the audit trail per the agent instructions)
 *   6. set_verifier   — collection learns the verifier address
 *   7. register — admin registers (app_id=1, claim_type=1)
 *
 * The script writes the resulting addresses + tx hashes to
 * `contracts/deployments/v0.2-testnet.json` so downstream tooling
 * (`DEPLOYMENTS.md` update, demo doc, Mini App env example) can
 * consume them.
 *
 * Bypasses `@ton/blueprint`'s CLI runner because v0.27 + Node 24 hit
 * a Dirent.path → Dirent.parentPath regression; the cell hashes,
 * stateInit construction, and message bodies still come from the
 * same wrappers the sandbox tests use.
 */
import * as fs from "node:fs";
import * as path from "node:path";

import {
  Address,
  beginCell,
  Cell,
  internal,
  SendMode,
  StateInit,
  storeStateInit,
  toNano,
  WalletContractV3R2,
  WalletContractV4,
  WalletContractV5R1,
} from "@ton/ton";
import { TonClient } from "@ton/ton";
import { mnemonicToPrivateKey } from "@ton/crypto";

// ---------- toncenter rate-limit guardrail ----------
//
// The free testnet toncenter tier is ~1 RPS. Every public method
// goes through a shared mutex so consecutive calls are spaced by at
// least RATE_DELAY_MS. On HTTP 429, we sleep RETRY_BACKOFF_MS and
// retry up to MAX_RETRIES times.

const RATE_DELAY_MS = Number(process.env.RATE_DELAY_MS ?? 1_500);
const RETRY_BACKOFF_MS = Number(process.env.RETRY_BACKOFF_MS ?? 20_000);
const MAX_RETRIES = Number(process.env.MAX_RETRIES ?? 6);

let throttleChain: Promise<unknown> = Promise.resolve();
function throttled<T>(fn: () => Promise<T>): Promise<T> {
  const next = throttleChain.then(async () => {
    await new Promise((r) => setTimeout(r, RATE_DELAY_MS));
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        return await fn();
      } catch (e: any) {
        const status = e?.response?.status ?? e?.status;
        if (status === 429) {
          const wait = RETRY_BACKOFF_MS * Math.pow(2, attempt);
          console.warn(`  [rate-limit] sleep ${wait}ms then retry (attempt ${attempt + 1}/${MAX_RETRIES})`);
          await new Promise((r) => setTimeout(r, wait));
          continue;
        }
        throw e;
      }
    }
    throw new Error("toncenter retries exhausted");
  });
  throttleChain = next.catch(() => undefined);
  return next as Promise<T>;
}

import {
  AppRegistry,
  registryConfigToCell,
  REGISTRY_OP_REGISTER,
} from "../wrappers/AppRegistry";
import {
  SoulboundCollection,
  collectionConfigToCell,
  COLLECTION_OP_SET_VERIFIER,
} from "../wrappers/SoulboundCollection";
import {
  Groth16Verifier,
  verifierConfigToCell,
  GROTH16_OP_SET_REGISTRY,
  GROTH16_OP_SET_COLLECTION,
} from "../wrappers/Groth16Verifier";
import { compile } from "@ton/blueprint";

// ---------- helpers ----------

const TESTNET_ENDPOINT = "https://testnet.toncenter.com/api/v2/jsonRPC";

function explorerUrl(addr: Address | string): string {
  const s = typeof addr === "string" ? addr : addr.toString({ testOnly: true, bounceable: true });
  return `https://testnet.tonscan.org/address/${s}`;
}

function txExplorer(txHash: string): string {
  return `https://testnet.tonscan.org/tx/${txHash}`;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitDeploy(client: TonClient, addr: Address, label: string): Promise<void> {
  for (let i = 0; i < 60; i++) {
    const state = await throttled(() => client.getContractState(addr));
    if (state.state === "active") {
      console.log(`  [${label}] active`);
      return;
    }
    process.stdout.write(`  [${label}] waiting (${i}s, state=${state.state})…\r`);
    await sleep(2_000);
  }
  throw new Error(`${label} never became active`);
}

async function getLastTxHash(client: TonClient, addr: Address): Promise<string> {
  for (let i = 0; i < 60; i++) {
    const txs = await throttled(() => client.getTransactions(addr, { limit: 1 }));
    if (txs.length > 0) {
      return txs[0].hash().toString("hex");
    }
    await sleep(1_000);
  }
  throw new Error(`no transactions for ${addr.toString()}`);
}

interface WireDeployment {
  registry: { address: string; tx: string };
  collection: { address: string; tx: string };
  verifier: { address: string; tx: string };
  wiring: {
    verifier_set_collection: string;
    verifier_set_registry: string;
    collection_set_verifier: string;
    registry_register: string;
  };
  deployer: string;
  commit: string;
}

// ---------- main ----------

async function main(): Promise<void> {
  const mnemonic = process.env.WALLET_MNEMONIC;
  if (!mnemonic) throw new Error("WALLET_MNEMONIC env var is required");
  const words = mnemonic.split(/\s+/).filter(Boolean);
  if (words.length !== 24) throw new Error(`expected 24 mnemonic words, got ${words.length}`);
  const version = (process.env.WALLET_VERSION ?? "v4R2").toLowerCase();

  const keypair = await mnemonicToPrivateKey(words);
  let wallet;
  switch (version) {
    case "v3r2":
      wallet = WalletContractV3R2.create({
        workchain: 0,
        publicKey: keypair.publicKey,
      });
      break;
    case "v5r1":
      wallet = WalletContractV5R1.create({
        workchain: 0,
        publicKey: keypair.publicKey,
      });
      break;
    case "v4r2":
    default:
      wallet = WalletContractV4.create({
        workchain: 0,
        publicKey: keypair.publicKey,
      });
      break;
  }
  const deployerAddr = wallet.address;
  console.log(`deployer wallet (${version}): ${deployerAddr.toString({ testOnly: true })}`);

  const apiKey = process.env.TONCENTER_API_KEY;
  const client = new TonClient({
    endpoint: process.env.TON_ENDPOINT ?? TESTNET_ENDPOINT,
    apiKey,
  });

  const balance = await throttled(() => client.getBalance(deployerAddr));
  console.log(`balance: ${balance.toString()} nano-TON  (≈ ${Number(balance) / 1e9} TON)`);
  if (process.env.CHECK_ONLY === "1") {
    console.log("CHECK_ONLY=1 set; exiting before any transaction is sent.");
    return;
  }
  if (balance < toNano("1")) {
    throw new Error(`deployer balance below 1 TON; top up first`);
  }

  const walletContract = client.open(wallet);
  let seqno = await throttled(() => walletContract.getSeqno());
  const send = async (to: Address, value: bigint, opts: { body?: Cell; init?: StateInit } = {}): Promise<string> => {
    const messages = [
      internal({
        to,
        value,
        bounce: opts.init ? false : true,
        body: opts.body ?? new Cell(),
        init: opts.init,
      }),
    ];
    await throttled(() =>
      walletContract.sendTransfer({
        seqno,
        secretKey: keypair.secretKey,
        sendMode: SendMode.PAY_GAS_SEPARATELY,
        messages,
      }),
    );
    const prevSeqno = seqno;
    seqno += 1;
    // Wait for seqno bump — spaced via throttle.
    for (let i = 0; i < 30; i++) {
      const cur = await throttled(() => walletContract.getSeqno());
      if (cur > prevSeqno) break;
      await sleep(3_000);
    }
    const hash = await getLastTxHash(client, to);
    return hash;
  };

  // ----- compile -----
  console.log("compiling contracts…");
  const registryCode = await compile("AppRegistry");
  const collectionCode = await compile("SoulboundCollection");
  const itemCode = await compile("SoulboundItem");
  const verifierCode = await compile("Groth16Verifier");

  // ----- 1. Registry -----
  console.log("\n[1/7] Deploy AppRegistry");
  const registryData = registryConfigToCell({ admin: deployerAddr });
  const registryInit: StateInit = { code: registryCode, data: registryData };
  const registryAddr = computeAddress(registryInit);
  console.log(`  address: ${registryAddr.toString({ testOnly: true })}`);
  console.log(`  explorer: ${explorerUrl(registryAddr)}`);
  let txHash = await send(registryAddr, toNano("0.1"), { init: registryInit });
  await waitDeploy(client, registryAddr, "registry");
  console.log(`  tx: ${txHash}  ${txExplorer(txHash)}`);
  const out: WireDeployment = {
    registry: { address: registryAddr.toString({ testOnly: true }), tx: txHash },
    collection: { address: "", tx: "" },
    verifier: { address: "", tx: "" },
    wiring: {
      verifier_set_collection: "",
      verifier_set_registry: "",
      collection_set_verifier: "",
      registry_register: "",
    },
    deployer: deployerAddr.toString({ testOnly: true }),
    commit: process.env.GIT_COMMIT ?? "",
  };

  // ----- 2. Collection -----
  console.log("\n[2/7] Deploy SoulboundCollection");
  const collectionData = collectionConfigToCell({
    verifier: deployerAddr,           // placeholder; rotated in step 6
    owner: deployerAddr,
    content: beginCell().storeUint(0, 8).endCell(),
    itemCode,
  });
  const collectionInit: StateInit = { code: collectionCode, data: collectionData };
  const collectionAddr = computeAddress(collectionInit);
  console.log(`  address: ${collectionAddr.toString({ testOnly: true })}`);
  txHash = await send(collectionAddr, toNano("0.1"), { init: collectionInit });
  await waitDeploy(client, collectionAddr, "collection");
  console.log(`  tx: ${txHash}  ${txExplorer(txHash)}`);
  out.collection = { address: collectionAddr.toString({ testOnly: true }), tx: txHash };

  // ----- 3. Verifier -----
  console.log("\n[3/7] Deploy Groth16Verifier");
  const verifierData = verifierConfigToCell({
    admin: deployerAddr,
    registry: registryAddr,
    collection: collectionAddr,
  });
  const verifierInit: StateInit = { code: verifierCode, data: verifierData };
  const verifierAddr = computeAddress(verifierInit);
  console.log(`  address: ${verifierAddr.toString({ testOnly: true })}`);
  txHash = await send(verifierAddr, toNano("0.5"), { init: verifierInit });
  await waitDeploy(client, verifierAddr, "verifier");
  console.log(`  tx: ${txHash}  ${txExplorer(txHash)}`);
  out.verifier = { address: verifierAddr.toString({ testOnly: true }), tx: txHash };

  // ----- 4. Verifier ← set_collection (audit trail) -----
  console.log("\n[4/7] op::set_collection on verifier (audit only — already set at deploy)");
  let body = beginCell()
    .storeUint(GROTH16_OP_SET_COLLECTION, 32)
    .storeUint(1n, 64)
    .storeAddress(collectionAddr)
    .endCell();
  txHash = await send(verifierAddr, toNano("0.05"), { body });
  console.log(`  tx: ${txHash}  ${txExplorer(txHash)}`);
  out.wiring.verifier_set_collection = txHash;

  // ----- 5. Verifier ← set_registry (audit trail) -----
  console.log("\n[5/7] op::set_registry on verifier (audit only — already set at deploy)");
  body = beginCell()
    .storeUint(GROTH16_OP_SET_REGISTRY, 32)
    .storeUint(2n, 64)
    .storeAddress(registryAddr)
    .endCell();
  txHash = await send(verifierAddr, toNano("0.05"), { body });
  console.log(`  tx: ${txHash}  ${txExplorer(txHash)}`);
  out.wiring.verifier_set_registry = txHash;

  // ----- 6. Collection ← set_verifier -----
  console.log("\n[6/7] op::set_verifier on collection");
  body = beginCell()
    .storeUint(COLLECTION_OP_SET_VERIFIER, 32)
    .storeUint(3n, 64)
    .storeAddress(verifierAddr)
    .endCell();
  txHash = await send(collectionAddr, toNano("0.05"), { body });
  console.log(`  tx: ${txHash}  ${txExplorer(txHash)}`);
  out.wiring.collection_set_verifier = txHash;

  // ----- 7. Registry ← register (app_id=1, claim_type=1) -----
  console.log("\n[7/7] op::register on registry (1, 1)");
  body = beginCell()
    .storeUint(REGISTRY_OP_REGISTER, 32)
    .storeUint(4n, 64)
    .storeUint(1n, 64)
    .storeUint(1n, 32)
    .endCell();
  txHash = await send(registryAddr, toNano("0.05"), { body });
  console.log(`  tx: ${txHash}  ${txExplorer(txHash)}`);
  out.wiring.registry_register = txHash;

  // ----- write deployment JSON -----
  const outDir = path.join(__dirname, "..", "deployments");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "v0.2-testnet.json");
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2) + "\n");
  console.log(`\nwrote ${outPath}`);
  console.log("Phase D1 deploy complete.");
}

function computeAddress(init: StateInit): Address {
  const stateInitCell = beginCell().store(storeStateInit(init)).endCell();
  return new Address(0, stateInitCell.hash());
}

main().catch((e) => {
  console.error("deploy failed:", e);
  process.exit(1);
});
