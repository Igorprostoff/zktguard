/**
 * `@zktguard/sdk` — TypeScript client for zkTGuard.
 *
 * v0.2 surface is the four methods named in the project bible:
 * {@link ZktGuardClient.init}, {@link ZktGuardClient.requireClaim},
 * {@link ZktGuardClient.getCredential}, and
 * {@link ZktGuardClient.verifyCredential}.
 *
 * The implementation orchestrates three v0.2 components: the proxy
 * attestor (Task 7), a remote Rust Groth16 prover (Task A5), and the
 * on-chain verifier (Task 4). v0.2 no longer ships an in-process
 * synthetic prover — the placeholder VK from v0.1 has been retired in
 * favour of a real Phase-2 contribution.
 */
import { Address, beginCell, Cell, TonClient } from "@ton/ton";

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
   * Base URL of the remote Groth16 prover, e.g.
   * `http://127.0.0.1:7679`. Required at runtime; tests may stub the
   * `fetch` call.
   */
  proverUrl: string;
  /** Optional pre-built {@link TonClient}. */
  tonClient?: TonClient;
}

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
  /** Optional attestor pubkey override; defaults to the pubkey the
   *  `/attest` response carries. */
  attestorPubkey?: { x: bigint; y: bigint };
  /** Upstream path the attestor should fetch. Defaults to `/account`. */
  accountPath?: string;
  /**
   * @deprecated v0.2 Phase B derives `creation_timestamp` inside the
   * circuit from the decrypted transcript; this field is ignored.
   */
  creationTimestamp?: bigint;
}

/** Result of a successful claim flow. */
export interface Credential {
  /** Nullifier emitted by the circuit; primary key on chain. */
  nullifier: bigint;
  /** BLS12-381 compressed proof points (uppercase hex). */
  proof: {
    aHex: string;
    bHex: string;
    cHex: string;
  };
  /** Public-input vector echoed back, in the order the verifier reads. */
  publicInputs: bigint[];
}

/** Status of an in-flight proof. */
export type ProofStatus =
  | { status: "parked" }
  | { status: "minted" }
  | { status: "rejected" }
  | { status: "expired" };

// ---------------------------------------------------------------------
// Constants matching the FunC verifier
// ---------------------------------------------------------------------

const OP_VERIFY_CLAIM = 0x76657266;
const NONCE_RANDOM_BITS = 224n;

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
  ) {}

  /**
   * Build a client from a configuration object.
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
      1n; // sandbox shares the testnet chain id
    if (!config.proverUrl) {
      throw new Error("config.proverUrl is required (v0.2)");
    }
    return new ZktGuardClient(config, addr, chainId);
  }

  /**
   * Hit the attestor, post the witness to the remote prover, return
   * the resulting proof + nullifier. Does NOT broadcast on chain —
   * the caller wires that via TON Connect.
   */
  async requireClaim(
    claim: string,
    options: ClaimOptions,
  ): Promise<Credential> {
    void claim; // reserved for future claim-router dispatch

    const attest = await this.fetchAttestation(options);

    const random =
      (BigInt.asUintN(224, BigInt(Date.now()))) & ((1n << 224n) - 1n);
    const noncePacked = packNonce(this.chainId, random);

    const pubkey = options.attestorPubkey ?? attest.pubkey;

    // Private ChaCha20-Poly1305 witness from the attestor sealing
    // (v0.2 Phase B). Byte buffers are zero-padded to the circuit's
    // compile-time sizes; the length signals carry the real extent.
    const witness = {
      nonce: noncePacked.toString(),
      app_id: options.appId.toString(),
      expiration: options.expirationSec.toString(),
      claim_type: options.claimType.toString(),
      attestor_pubkey_x: pubkey.x.toString(),
      attestor_pubkey_y: pubkey.y.toString(),
      threshold_months: options.thresholdMonths.toString(),
      user_secret: options.userSecret.toString(),
      current_time: BigInt(Math.floor(Date.now() / 1000)).toString(),
      timestamp_offset: attest.createdAtOffset.toString(),
      tls_key: bytesToFieldStrings(attest.key, 32),
      tls_nonce: bytesToFieldStrings(attest.nonce, 12),
      ciphertext: bytesToFieldStrings(attest.ciphertext, MAX_CIPHERTEXT_BYTES),
      ciphertext_length: attest.ciphertext.length.toString(),
      aad: bytesToFieldStrings(attest.aad, MAX_AAD_BYTES),
      aad_length: attest.aad.length.toString(),
      tag: bytesToFieldStrings(attest.tag, 16),
    };

    const proofResp = await fetch(`${this.config.proverUrl.replace(/\/+$/, "")}/prove`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ claim, witness }),
    });
    if (!proofResp.ok) {
      throw new Error(`prover /prove returned ${proofResp.status}`);
    }
    const body = (await proofResp.json()) as {
      aHex: string;
      bHex: string;
      cHex: string;
      publicInputs: string[];
    };

    const publicInputs = body.publicInputs.map((s) => BigInt(s));
    if (publicInputs.length !== 8) {
      throw new Error(`prover returned ${publicInputs.length} public inputs, expected 8`);
    }
    return {
      nullifier: publicInputs[0],
      proof: { aHex: body.aHex, bHex: body.bHex, cHex: body.cHex },
      publicInputs,
    };
  }

  /**
   * Look up the status of a proof previously submitted via
   * {@link ZktGuardClient.requireClaim}. v0.2's verifier tracks
   * parked proofs in an on-chain dictionary keyed by `queryId`; this
   * method polls that dictionary plus the nullifier set to derive a
   * coarse status.
   */
  async getProofStatus(
    queryId: bigint,
    nullifier: bigint,
  ): Promise<ProofStatus> {
    const client = this.config.tonClient;
    if (!client) {
      throw new Error(
        "getProofStatus requires config.tonClient (TonClient) to be set",
      );
    }
    const parkedRes = await client.runMethod(
      this.verifierAddress,
      "parked_entry",
      [{ type: "int", value: queryId }],
    );
    const parked = parkedRes.stack.readNumber() !== 0;
    if (parked) return { status: "parked" };
    const usedRes = await client.runMethod(
      this.verifierAddress,
      "nullifier_used?",
      [{ type: "int", value: nullifier }],
    );
    const used = usedRes.stack.readNumber() !== 0;
    if (used) return { status: "minted" };
    return { status: "rejected" };
  }

  /**
   * Polls {@link ZktGuardClient.getProofStatus} every `intervalMs`
   * (default 5 s) until the status leaves `"parked"` or `maxWaitMs`
   * elapses (default 5 min). Returns the terminal status.
   */
  async waitForMint(
    queryId: bigint,
    nullifier: bigint,
    opts: { intervalMs?: number; maxWaitMs?: number } = {},
  ): Promise<ProofStatus> {
    const intervalMs = opts.intervalMs ?? 5_000;
    const maxWaitMs = opts.maxWaitMs ?? 300_000;
    const start = Date.now();
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const s = await this.getProofStatus(queryId, nullifier);
      if (s.status !== "parked") return s;
      if (Date.now() - start > maxWaitMs) return { status: "expired" };
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  }

  /**
   * Look up an existing credential for `user`. v0.2's soulbound
   * collection addresses items deterministically by index but does
   * not yet maintain an owner→item index on chain — that landing is
   * v0.3 work. Returns `null` until that index ships; demo apps
   * persist the user's last credential client-side and poll via
   * {@link ZktGuardClient.getProofStatus}.
   */
  async getCredential(
    user: Address,
    claim: string,
  ): Promise<Credential | null> {
    void user;
    void claim;
    return null;
  }

  /**
   * On-chain check that `nullifier` is recorded in the verifier's
   * `nullifiers_dict`.
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
  // Internal helpers
  // -----------------------------------------------------------------

  private async fetchAttestation(
    options: ClaimOptions,
  ): Promise<Attestation> {
    const url = `${this.config.attestorUrl.replace(/\/+$/, "")}/attest`;
    const resp = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path: options.accountPath ?? "/account" }),
    });
    if (!resp.ok) {
      throw new Error(`attestor /attest returned ${resp.status}`);
    }
    const body = (await resp.json()) as {
      key_hex: string;
      nonce_hex: string;
      aad_hex: string;
      ciphertext_hex: string;
      tag_hex: string;
      created_at_offset: number;
      pubkey_x: string;
      pubkey_y: string;
    };
    if (body.created_at_offset < 0) {
      throw new Error(`attestor transcript has no "created_at" marker`);
    }
    const ciphertext = hexToBytes(body.ciphertext_hex);
    if (ciphertext.length > MAX_CIPHERTEXT_BYTES) {
      throw new Error(
        `transcript ${ciphertext.length} B exceeds circuit max ${MAX_CIPHERTEXT_BYTES} B`,
      );
    }
    return {
      pubkey: { x: BigInt(body.pubkey_x), y: BigInt(body.pubkey_y) },
      key: hexToBytes(body.key_hex),
      nonce: hexToBytes(body.nonce_hex),
      aad: hexToBytes(body.aad_hex),
      ciphertext,
      tag: hexToBytes(body.tag_hex),
      createdAtOffset: body.created_at_offset,
    };
  }
}

/** Parsed attestor `/attest` sealing (v0.2 Phase B). */
interface Attestation {
  pubkey: { x: bigint; y: bigint };
  key: Uint8Array;
  nonce: Uint8Array;
  aad: Uint8Array;
  ciphertext: Uint8Array;
  tag: Uint8Array;
  createdAtOffset: number;
}

/** Max Telegram response size the circuit is compiled for (bytes). */
export const MAX_CIPHERTEXT_BYTES = 512;
/** Max AAD size the circuit is compiled for (bytes). */
export const MAX_AAD_BYTES = 16;

// Zero-pad `bytes` to `len` and render each as a decimal field-element
// string, the shape snarkjs expects for a byte-array signal.
function bytesToFieldStrings(bytes: Uint8Array, len: number): string[] {
  if (bytes.length > len) {
    throw new Error(`buffer ${bytes.length} B exceeds circuit size ${len} B`);
  }
  const out = new Array<string>(len);
  for (let i = 0; i < len; i++) {
    out[i] = (i < bytes.length ? bytes[i] : 0).toString();
  }
  return out;
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
// Verifier message body builder (used by Mini App + examples)
// ---------------------------------------------------------------------

/**
 * Build the message body the FunC verifier reads. Returns a {@link
 * Cell} for direct embedding into TON Connect transactions.
 *
 * v0.2 layout (output-first public inputs):
 *   pi[0] = nullifier
 *   pi[1] = nonce
 *   pi[2] = app_id
 *   pi[3] = expiration
 *   pi[4] = claim_type
 *   pi[5] = attestor_pubkey_x
 *   pi[6] = attestor_pubkey_y
 *   pi[7] = threshold_months
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
