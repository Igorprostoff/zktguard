/**
 * Shared on-chain helpers for the e2e specs.
 *
 * Centralises the boilerplate around toncenter polling: building a
 * throttled TonClient, capturing a "baseline" transaction marker
 * before submitting a tx, then polling for new transactions and
 * extracting their VM exit codes.
 */
import { Address, TonClient } from "@ton/ton";

import { throttled } from "./throttle";
import deployment from "../../../contracts/deployments/v0.2-testnet.json" with { type: "json" };

export const VERIFIER_ADDR = Address.parse(deployment.verifier.address);
export const REGISTRY_ADDR = Address.parse(deployment.registry.address);
export const COLLECTION_ADDR = Address.parse(deployment.collection.address);

const TESTNET_ENDPOINT =
  process.env.TON_TESTNET_ENDPOINT ??
  "https://testnet.toncenter.com/api/v2/jsonRPC";

export function makeClient(): TonClient {
  return new TonClient({
    endpoint: TESTNET_ENDPOINT,
    apiKey: process.env.TONCENTER_API_KEY,
  });
}

export interface TxMarker {
  lt: bigint;
  hash: Buffer;
}

/** Most recent transaction on `addr`, or `null` if the account has no
 *  recorded txs yet. Used to capture a baseline before submitting. */
export async function latestTxMarker(
  client: TonClient,
  addr: Address,
): Promise<TxMarker | null> {
  const state = await throttled(() => client.getContractState(addr));
  if (!state.lastTransaction) return null;
  return {
    lt: BigInt(state.lastTransaction.lt),
    hash: Buffer.from(state.lastTransaction.hash, "hex"),
  };
}

export interface FreshTx {
  exitCode: number | null;
  lt: bigint;
  hashHex: string;
  /** Normalised source address of the inMessage (or null for
   *  external messages). Use {@link addrsEqual} or {@link normalizeAddr}
   *  to compare against another address; never string-compare raw,
   *  because toncenter may report `0Q…` while the stub holds `kQ…`. */
  senderNorm: string | null;
}

/**
 * Canonical user-friendly form of a TON address for comparison.
 *
 * The bounce-flag and url-safe encodings produce visibly different
 * strings for the same underlying account (`kQ…` vs `0Q…` vs
 * `EQ…`/`UQ…`), and toncenter returns whichever the indexer happens
 * to hold. Comparing the raw strings is a footgun; comparing the
 * output of this helper is safe.
 */
export function normalizeAddr(addr: Address | string): string {
  const a = typeof addr === "string" ? Address.parse(addr) : addr;
  return a.toString({ urlSafe: true, bounceable: false, testOnly: true });
}

/** Equality on addresses regardless of bounce-flag or url-safe encoding. */
export function addrsEqual(
  a: Address | string,
  b: Address | string,
): boolean {
  return normalizeAddr(a) === normalizeAddr(b);
}

function extractSender(t: import("@ton/core").Transaction): string | null {
  const inMsg = t.inMessage;
  if (!inMsg) return null;
  const info = inMsg.info;
  if (info.type !== "internal") return null;
  return normalizeAddr(info.src);
}

async function listFresh(
  client: TonClient,
  addr: Address,
  since: TxMarker | null,
): Promise<FreshTx[]> {
  // Query the latest 20 txs directly without anchoring to
  // getContractState. The previous approach used getContractState to
  // get lt/hash for the cursor; if toncenter caches that state between
  // the parking tx and the registry-reply tx, subsequent polls query
  // from the stale lt and never see the reply. The cursor-free call
  // matches what the diagnostic script uses and always returns the
  // true latest txs. The `since` filter still pins the window.
  const txs = await throttled(() =>
    client.getTransactions(addr, { limit: 20 }),
  );
  return txs
    .filter((t) => since === null || t.lt > since.lt)
    .reverse()
    .map((t) => ({
      exitCode: extractExitCode(t),
      lt: t.lt,
      hashHex: t.hash().toString("hex"),
      senderNorm: extractSender(t),
    }));
}

/**
 * Wrap listFresh so a throttle-exhausted error (sustained toncenter
 * 5xx wave) is treated as a transient empty result instead of
 * killing the polling loop. The spec's own timeout still governs
 * the overall wait.
 */
async function listFreshSafe(
  client: TonClient,
  addr: Address,
  since: TxMarker | null,
): Promise<FreshTx[]> {
  try {
    return await listFresh(client, addr, since);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // eslint-disable-next-line no-console
    console.error(`[chain] listFresh transient (will retry): ${msg}`);
    return [];
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// Wall-clock pacing between poll iterations, on top of the throttle's
// per-RPC delay. Each iteration makes 1-2 RPC calls, so this caps
// poll work at ~0.2 RPS per loop without starving the throttle.
const POLL_INTERVAL_MS = 5_000;

/**
 * Poll `addr` for transactions newer than `since` until at least one
 * arrives or `timeoutMs` elapses. Returns the new transactions in
 * chronological order (oldest first).
 */
export async function waitForNewTxs(
  client: TonClient,
  addr: Address,
  since: TxMarker | null,
  timeoutMs: number,
): Promise<FreshTx[]> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const fresh = await listFreshSafe(client, addr, since);
    if (fresh.length > 0) return fresh;
    await sleep(POLL_INTERVAL_MS);
  }
  return [];
}

/**
 * Poll `addr` until a transaction matching `predicate` lands, returning
 * every fresh transaction seen along the way. Useful when the verifier
 * parks a proof (exit 0) before the actual reject lands on a later
 * tx in the same async flow.
 */
export async function waitForTxMatching(
  client: TonClient,
  addr: Address,
  since: TxMarker | null,
  predicate: (t: FreshTx) => boolean,
  timeoutMs: number,
): Promise<FreshTx[]> {
  const deadline = Date.now() + timeoutMs;
  const seen: FreshTx[] = [];
  const seenHashes = new Set<string>();
  while (Date.now() < deadline) {
    const fresh = await listFreshSafe(client, addr, since);
    for (const t of fresh) {
      if (!seenHashes.has(t.hashHex)) {
        seenHashes.add(t.hashHex);
        seen.push(t);
        if (predicate(t)) return seen;
      }
    }
    await sleep(POLL_INTERVAL_MS);
  }
  return seen;
}

function extractExitCode(t: import("@ton/core").Transaction): number | null {
  const d = t.description;
  if (d.type === "generic" && d.computePhase.type === "vm") {
    return d.computePhase.exitCode;
  }
  if (d.type === "tick-tock" && d.computePhase.type === "vm") {
    return d.computePhase.exitCode;
  }
  return null;
}

/** Truthy if `nullifier_used?(nf)` returns nonzero. */
export async function isNullifierUsed(
  client: TonClient,
  nf: bigint,
): Promise<boolean> {
  const res = await throttled(() =>
    client.runMethod(VERIFIER_ADDR, "nullifier_used?", [
      { type: "int", value: nf },
    ]),
  );
  return res.stack.readNumber() !== 0;
}

/** Truthy if `parked_entry(q)` returns nonzero (entry present). */
export async function isParked(
  client: TonClient,
  queryId: bigint,
): Promise<boolean> {
  const res = await throttled(() =>
    client.runMethod(VERIFIER_ADDR, "parked_entry", [
      { type: "int", value: queryId },
    ]),
  );
  return res.stack.readNumber() !== 0;
}
