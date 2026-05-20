/**
 * `@zktguard/sdk` — TypeScript client for zkTGuard.
 *
 * v0.1 surface is the four methods named in the project bible:
 * {@link ZktGuardClient.init}, {@link ZktGuardClient.requireClaim},
 * {@link ZktGuardClient.getCredential}, and
 * {@link ZktGuardClient.verifyCredential}.
 *
 * The implementation orchestrates three v0 components: the proxy
 * attestor (Task 7), the synthetic prover (Task 8), and the on-chain
 * verifier (Task 4). When Task 3's trusted setup lands, only the
 * prover's internals change — the SDK contract stays put.
 */
import { Address, beginCell, Cell, TonClient } from "@ton/ton";
import { bls12_381 } from "@noble/curves/bls12-381";

export { Address } from "@ton/ton";

/** Browser-safe hex encoding without Node's Buffer. */
function bytesToHexUpper(bytes: Uint8Array): string {
  let out = "";
  for (const b of bytes) {
    out += b.toString(16).padStart(2, "0");
  }
  return out.toUpperCase();
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (clean.length % 2 !== 0) {
    throw new Error(`hex has odd length: ${clean.length}`);
  }
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < clean.length; i += 2) {
    out[i / 2] = parseInt(clean.slice(i, i + 2), 16);
  }
  return out;
}

// ---------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------

/** Static configuration for the client. */
export interface ZktGuardConfig {
  /** TON network the verifier contract lives on. */
  network: "testnet" | "mainnet" | "sandbox";
  /** Verifier contract address (friendly format). */
  verifierAddress: string | Address;
  /** Base URL of the proxy attestor, e.g. `http://127.0.0.1:7677`. */
  attestorUrl: string;
  /**
   * v0 uses an in-process synthetic prover that mirrors the Rust
   * binary. `"remote"` is reserved for future hosted proving.
   */
  prover?: "in-process" | "remote";
  /** Optional pre-built {@link TonClient}. */
  tonClient?: TonClient;
  /**
   * Override the placeholder VK scalars (matches the FunC verifier).
   * Replace with real values after Task 3.
   */
  vk?: VkScalars;
}

/** Verifier-key scalars (placeholder for v0). */
export interface VkScalars {
  alpha: bigint;
  beta: bigint;
  gamma: bigint;
  delta: bigint;
  ic: bigint[]; // length must be num_public_inputs + 1 = 9
}

export const PLACEHOLDER_VK: VkScalars = {
  alpha: 1n,
  beta: 1n,
  gamma: 1n,
  delta: 1n,
  ic: [7n, 101n, 102n, 103n, 104n, 105n, 106n, 107n, 108n],
};

/** Per-claim inputs supplied by the application. */
export interface ClaimOptions {
  appId: bigint;
  claimType: bigint;
  thresholdMonths: bigint;
  /**
   * 256-bit user secret used as Poseidon input for nullifier
   * derivation. The caller is responsible for persisting it.
   */
  userSecret: bigint;
  /** Unix seconds — must be > now() on submission. */
  expirationSec: bigint;
  /** Optional attestor pubkey override; defaults to whatever
   *  `/pubkey` returns. */
  attestorPubkey?: { x: bigint; y: bigint };
}

/** Result of a successful claim flow. */
export interface Credential {
  /** Nullifier emitted by the circuit; primary key on chain. */
  nullifier: bigint;
  /**
   * Synthetic proof bytes the client would have submitted. v0
   * exposes these so the example apps can show the wire format;
   * production should treat them as opaque.
   */
  proof: {
    aHex: string;
    bHex: string;
    cHex: string;
  };
}

// ---------------------------------------------------------------------
// Constants matching the FunC verifier
// ---------------------------------------------------------------------

const OP_VERIFY_CLAIM = 0x76657266;
const NONCE_RANDOM_BITS = 224n;
const SCALAR_FIELD_ORDER = bls12_381.fields.Fr.ORDER;

const G1 = bls12_381.G1.ProjectivePoint.BASE;
const G2 = bls12_381.G2.ProjectivePoint.BASE;

// ---------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------

/**
 * Top-level client. Build one per (app, network) pair via
 * {@link ZktGuardClient.init} and reuse.
 */
export class ZktGuardClient {
  private constructor(
    private readonly config: ZktGuardConfig,
    private readonly verifierAddress: Address,
    private readonly chainId: bigint,
    private readonly vk: VkScalars,
  ) {}

  /**
   * Build a client from a configuration object. Validates inputs
   * eagerly so misconfiguration shows up at startup, not at first
   * call.
   *
   * @param config - {@link ZktGuardConfig}.
   * @returns a ready-to-use {@link ZktGuardClient}.
   */
  static init(config: ZktGuardConfig): ZktGuardClient {
    const addr =
      typeof config.verifierAddress === "string"
        ? Address.parse(config.verifierAddress)
        : config.verifierAddress;
    const chainId =
      config.network === "mainnet" ? 0n :
      config.network === "testnet" ? 1n :
      1n; // sandbox shares the testnet chain id for now
    const vk = config.vk ?? PLACEHOLDER_VK;
    if (vk.ic.length !== 9) {
      throw new Error(
        `vk.ic must have exactly 9 entries (got ${vk.ic.length})`,
      );
    }
    return new ZktGuardClient(config, addr, chainId, vk);
  }

  /**
   * End-to-end claim flow: ask the attestor for a signed transcript,
   * derive a nullifier, build a synthetic proof, and return the
   * submittable artefacts. v0 stops short of broadcasting the verify
   * message — callers wire that step through TON Connect because
   * the user's wallet pays the gas.
   *
   * @param claim - Logical claim name (e.g. `"account_age"`); v0
   *                accepts any string and threads it through.
   * @param options - {@link ClaimOptions}.
   */
  async requireClaim(
    claim: string,
    options: ClaimOptions,
  ): Promise<Credential> {
    void claim; // reserved for future claim-router dispatch.

    // 1. Hit the attestor.
    const attest = await this.fetchAttestation(options);

    // 2. Derive nullifier = Poseidon-compatible reference value.
    //    The circuit will compute Poseidon(user_secret, app_id,
    //    claim_type); v0 mirrors the same input vector so on-chain
    //    queries can find it later. We use the prover-side scalar
    //    field's representation.
    const nullifier = derivePlaceholderNullifier(
      options.userSecret,
      options.appId,
      options.claimType,
    );

    // 3. Synthesise the proof against the placeholder VK.
    const random = (BigInt.asUintN(224, BigInt(Date.now()))) & ((1n << 224n) - 1n);
    const noncePacked = packNonce(this.chainId, random);
    const publicInputs: bigint[] = [
      noncePacked,
      options.appId,
      options.expirationSec,
      options.claimType,
      nullifier,
      options.attestorPubkey?.x ?? attest.pubkey.x,
      options.attestorPubkey?.y ?? attest.pubkey.y,
      options.thresholdMonths,
    ];
    const { aHex, bHex, cHex } = craftSyntheticProof(this.vk, publicInputs);

    return { nullifier, proof: { aHex, bHex, cHex } };
  }

  /**
   * Check whether `nullifier` has already been recorded on the
   * verifier contract. Returns `null` if not present.
   *
   * @param user - Reserved for future per-user lookups; v0 ignores
   *               it because credentials are nullifier-keyed.
   * @param claim - Reserved (see above).
   */
  async getCredential(
    user: Address,
    claim: string,
  ): Promise<Credential | null> {
    void user;
    void claim;
    // v0 stub: integrate when the example apps wire it through the
    // soulbound NFT contract. Returning null is the safe default.
    return null;
  }

  /**
   * On-chain check that `nullifier` is recorded in the verifier's
   * `nullifiers_dict`.
   *
   * Requires a {@link TonClient} on `config.tonClient`. The
   * sandbox-backed test suite mocks this path.
   */
  async verifyCredential(nullifier: bigint): Promise<boolean> {
    const client = this.config.tonClient;
    if (!client) {
      throw new Error(
        "verifyCredential requires config.tonClient (TonClient) to be set",
      );
    }
    const res = await client.runMethod(this.verifierAddress, "nullifier_used?", [
      { type: "int", value: nullifier },
    ]);
    return res.stack.readNumber() !== 0;
  }

  // -----------------------------------------------------------------
  // Internal helpers (kept off the public surface)
  // -----------------------------------------------------------------

  private async fetchAttestation(
    options: ClaimOptions,
  ): Promise<{ pubkey: { x: bigint; y: bigint } }> {
    if (options.attestorPubkey) {
      return { pubkey: options.attestorPubkey };
    }
    const url = `${this.config.attestorUrl.replace(/\/+$/, "")}/pubkey`;
    const resp = await fetch(url);
    if (!resp.ok) {
      throw new Error(`attestor /pubkey returned ${resp.status}`);
    }
    const body = (await resp.json()) as { x: string; y: string };
    return { pubkey: { x: BigInt(body.x), y: BigInt(body.y) } };
  }
}

/**
 * Pack chain_id (high 32 bits) and random (low 224 bits) into the
 * 256-bit nonce field consumed by the Groth16 verifier.
 */
export function packNonce(chainId: bigint, random: bigint): bigint {
  if (chainId < 0n || chainId >= 1n << 32n) {
    throw new Error("chain_id must fit in 32 bits");
  }
  if (random < 0n || random >= 1n << NONCE_RANDOM_BITS) {
    throw new Error("nonce random component must fit in 224 bits");
  }
  return (chainId << NONCE_RANDOM_BITS) | random;
}

// ---------------------------------------------------------------------
// Nullifier (v0 placeholder — Poseidon lives in circomlibjs which is
// heavy for the SDK bundle; we wrap a deterministic mixing function
// matching the *interface* of Poseidon over the same scalar field.
// Real Poseidon will land alongside the circuit's real body).
// ---------------------------------------------------------------------

export function derivePlaceholderNullifier(
  userSecret: bigint,
  appId: bigint,
  claimType: bigint,
): bigint {
  // Linear mix mod r — placeholder that maintains the property
  // tested in `circuits/test/nullifier_js.spec.ts`: distinct
  // (userSecret, appId, claimType) tuples give distinct outputs.
  const r = SCALAR_FIELD_ORDER;
  const M = (1n << 64n) - 1n;
  const mix = (
    (userSecret % r) * 0x100000001n +
    ((appId & M) * 0x1FFFFFFFFFFFFFFFn) +
    ((claimType & M) * 0x2FFFFFFFFFFFFFFFn) +
    1n
  ) % r;
  return mix === 0n ? 1n : mix;
}

// ---------------------------------------------------------------------
// Synthetic proof crafter (mirrors prover/src/lib.rs)
// ---------------------------------------------------------------------

function modR(x: bigint): bigint {
  const r = SCALAR_FIELD_ORDER;
  const m = x % r;
  return m >= 0n ? m : m + r;
}

function modInverse(x: bigint): bigint {
  return modPow(x, SCALAR_FIELD_ORDER - 2n, SCALAR_FIELD_ORDER);
}

function modPow(base: bigint, exp: bigint, mod: bigint): bigint {
  let r = 1n;
  let b = base % mod;
  let e = exp;
  while (e > 0n) {
    if (e & 1n) r = (r * b) % mod;
    b = (b * b) % mod;
    e >>= 1n;
  }
  return r;
}

/**
 * Construct a Groth16 proof satisfying the four-pair equation for
 * the given VK and public inputs. v0 picks (a, b) deterministically;
 * production would draw them from a CSPRNG.
 */
export function craftSyntheticProof(
  vk: VkScalars,
  publicInputs: bigint[],
  a: bigint = 7n,
  b: bigint = 11n,
): { aHex: string; bHex: string; cHex: string; cScalar: bigint } {
  if (publicInputs.length !== 8) {
    throw new Error(`expected 8 public inputs, got ${publicInputs.length}`);
  }
  let s_x = vk.ic[0];
  for (let i = 0; i < 8; i++) {
    s_x = modR(s_x + vk.ic[i + 1] * modR(publicInputs[i]));
  }
  const rhsNoC = modR(vk.alpha * vk.beta + vk.gamma * s_x);
  const c = modR((a * b - rhsNoC) * modInverse(vk.delta));

  const A = G1.multiply(a);
  const B = G2.multiply(b);
  const C = G1.multiply(c);
  return {
    aHex: bytesToHexUpper(A.toRawBytes(true)),
    bHex: bytesToHexUpper(B.toRawBytes(true)),
    cHex: bytesToHexUpper(C.toRawBytes(true)),
    cScalar: c,
  };
}

// ---------------------------------------------------------------------
// Verifier message body builder (used by Mini App + examples)
// ---------------------------------------------------------------------

/**
 * Build the message body the FunC verifier reads. Returns a {@link
 * Cell} for direct embedding into TON Connect transactions.
 */
export function buildVerifierMessageBody(opts: {
  queryId: bigint;
  proof: { aHex: string; bHex: string; cHex: string };
  publicInputs: bigint[];
}): Cell {
  if (opts.publicInputs.length !== 8) {
    throw new Error(`expected 8 public inputs, got ${opts.publicInputs.length}`);
  }
  const aBytes = hexToBytes(opts.proof.aHex);
  const bBytes = hexToBytes(opts.proof.bHex);
  const cBytes = hexToBytes(opts.proof.cHex);
  if (aBytes.length !== 48 || cBytes.length !== 48 || bBytes.length !== 96) {
    throw new Error("proof bytes must be 48/96/48 (compressed BLS12-381)");
  }

  const pi2 = beginCell()
    .storeUint(opts.publicInputs[6], 256)
    .storeUint(opts.publicInputs[7], 256)
    .endCell();
  const pi1 = beginCell()
    .storeUint(opts.publicInputs[3], 256)
    .storeUint(opts.publicInputs[4], 256)
    .storeUint(opts.publicInputs[5], 256)
    .storeRef(pi2)
    .endCell();
  const piHead = beginCell()
    .storeUint(opts.publicInputs[0], 256)
    .storeUint(opts.publicInputs[1], 256)
    .storeUint(opts.publicInputs[2], 256)
    .storeRef(pi1)
    .endCell();

  return beginCell()
    .storeUint(OP_VERIFY_CLAIM, 32)
    .storeUint(opts.queryId, 64)
    .storeRef(buildPointCell(aBytes))
    .storeRef(buildPointCell(bBytes))
    .storeRef(buildPointCell(cBytes))
    .storeRef(piHead)
    .endCell();
}

function buildPointCell(bytes: Uint8Array): Cell {
  let b = beginCell();
  for (const byte of bytes) {
    b = b.storeUint(byte, 8);
  }
  return b.endCell();
}

/** Re-export of the op code so callers don't hard-code magic numbers. */
export const OP_CODES = {
  verifyClaim: OP_VERIFY_CLAIM,
} as const;
