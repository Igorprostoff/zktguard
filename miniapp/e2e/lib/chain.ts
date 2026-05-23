/**
 * Shared on-chain helpers for the e2e specs.
 *
 * Centralises the boilerplate around toncenter polling: building a
 * throttled TonClient, capturing a "baseline" transaction marker
 * before submitting a tx, then polling for new transactions and
 * extracting their VM exit codes.
 */
import { Address, TonClient } from "@ton/ton";

// contracts/ is a CommonJS package; Node's ESM loader exposes CJS
// modules through their default export only. Destructure off the
// default to keep the call sites unchanged.
import throttleModule from "../../../contracts/lib/throttle";
const { throttled } = throttleModule;
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
): Promise<
  Array<{
    exitCode: number | null;
    lt: bigint;
    hashHex: string;
  }>
> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const state = await throttled(() => client.getContractState(addr));
    if (!state.lastTransaction) continue;
    const lt = BigInt(state.lastTransaction.lt);
    if (since !== null && lt <= since.lt) continue;
    const txs = await throttled(() =>
      client.getTransactions(addr, {
        limit: 20,
        lt: state.lastTransaction!.lt,
        hash: state.lastTransaction!.hash,
      }),
    );
    const fresh = txs
      .filter((t) => since === null || t.lt > since.lt)
      .reverse()
      .map((t) => ({
        exitCode: extractExitCode(t),
        lt: t.lt,
        hashHex: t.hash().toString("hex"),
      }));
    if (fresh.length > 0) return fresh;
  }
  return [];
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
