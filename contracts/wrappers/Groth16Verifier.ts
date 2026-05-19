import {
  Address,
  beginCell,
  Cell,
  Contract,
  contractAddress,
  ContractProvider,
  Sender,
  SendMode,
} from "@ton/core";
import { bls12_381 } from "@noble/curves/bls12-381";

export const GROTH16_OP_VERIFY_CLAIM = 0x76657266;

export const SCALAR_FIELD_ORDER = bls12_381.fields.Fr.ORDER;

const G1_BASE = bls12_381.G1.ProjectivePoint.BASE;
const G2_BASE = bls12_381.G2.ProjectivePoint.BASE;

// ---------------------------------------------------------------------
// Placeholder VK scalars. Mirror the FunC constants exactly so JS-side
// proof crafting yields proofs that the contract will accept. Replace
// with values derived from Task 3's trusted setup once that lands.
// ---------------------------------------------------------------------

export interface VkScalars {
  alpha: bigint;
  beta: bigint;
  gamma: bigint;
  delta: bigint;
  ic: bigint[];
}

export const PLACEHOLDER_VK: VkScalars = {
  alpha: 1n,
  beta: 1n,
  gamma: 1n,
  delta: 1n,
  ic: [7n, 101n, 102n, 103n, 104n, 105n, 106n, 107n, 108n],
};

// ---------------------------------------------------------------------
// Public input encoding (8 × 256-bit scalars, snake of 3 + 3 + 2 cells)
// ---------------------------------------------------------------------

export interface PublicInputs {
  nonce: bigint;
  app_id: bigint;
  expiration: bigint;
  claim_type: bigint;
  nullifier: bigint;
  attestor_pubkey_x: bigint;
  attestor_pubkey_y: bigint;
  threshold_months: bigint;
}

export function publicInputsToVector(pi: PublicInputs): bigint[] {
  return [
    pi.nonce,
    pi.app_id,
    pi.expiration,
    pi.claim_type,
    pi.nullifier,
    pi.attestor_pubkey_x,
    pi.attestor_pubkey_y,
    pi.threshold_months,
  ];
}

export function buildPublicInputsCell(pi: PublicInputs): Cell {
  const v = publicInputsToVector(pi);
  if (v.length !== 8) {
    throw new Error("expected 8 public inputs");
  }

  // Cells stored "tail-first" — innermost cell first, then wrap outward.
  const c2 = beginCell()
    .storeUint(v[6], 256)
    .storeUint(v[7], 256)
    .endCell();

  const c1 = beginCell()
    .storeUint(v[3], 256)
    .storeUint(v[4], 256)
    .storeUint(v[5], 256)
    .storeRef(c2)
    .endCell();

  const c0 = beginCell()
    .storeUint(v[0], 256)
    .storeUint(v[1], 256)
    .storeUint(v[2], 256)
    .storeRef(c1)
    .endCell();

  return c0;
}

// ---------------------------------------------------------------------
// Chain ID packing (high 32 bits of `nonce`)
// ---------------------------------------------------------------------

const NONCE_RANDOM_BITS = 224n;
const NONCE_RANDOM_MASK = (1n << NONCE_RANDOM_BITS) - 1n;

export function packNonce(chainId: bigint, random: bigint): bigint {
  if (chainId < 0n || chainId >= 1n << 32n) {
    throw new Error("chain_id must fit in 32 bits");
  }
  if (random < 0n || random > NONCE_RANDOM_MASK) {
    throw new Error("nonce random component must fit in 224 bits");
  }
  return (chainId << NONCE_RANDOM_BITS) | random;
}

// ---------------------------------------------------------------------
// Synthetic valid-proof crafter
//
// For the placeholder VK above, the Groth16 verification equation
// reduces to
//
//     a · b ≡ α·β + γ·s_x + δ·c   (mod r)
//
// where s_x = IC[0] + Σ IC[i+1] · pi[i].
// Pick (a, b) freely and solve for c.
// ---------------------------------------------------------------------

export interface Groth16Proof {
  a: Buffer; // 48 bytes (G1 compressed)
  b: Buffer; // 96 bytes (G2 compressed)
  c: Buffer; // 48 bytes (G1 compressed)
}

function modR(x: bigint): bigint {
  const r = SCALAR_FIELD_ORDER;
  const m = x % r;
  return m >= 0n ? m : m + r;
}

function modInverse(x: bigint): bigint {
  // Fermat: x^(r-2) mod r
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

export function craftSyntheticProof(
  pi: PublicInputs,
  opts: { a?: bigint; b?: bigint } = {},
): Groth16Proof & { aScalar: bigint; bScalar: bigint; cScalar: bigint } {
  const v = publicInputsToVector(pi);
  const { alpha, beta, gamma, delta, ic } = PLACEHOLDER_VK;

  let s_x = ic[0];
  for (let i = 0; i < 8; i++) {
    s_x = modR(s_x + ic[i + 1] * modR(v[i]));
  }

  const a = opts.a ?? 7n;
  const b = opts.b ?? 11n;

  const rhs_no_c = modR(alpha * beta + gamma * s_x);
  const target = modR(a * b - rhs_no_c);
  const c = modR(target * modInverse(delta));

  const aPoint = G1_BASE.multiply(a);
  const bPoint = G2_BASE.multiply(b);
  const cPoint = G1_BASE.multiply(c);

  return {
    a: Buffer.from(aPoint.toRawBytes(true)),
    b: Buffer.from(bPoint.toRawBytes(true)),
    c: Buffer.from(cPoint.toRawBytes(true)),
    aScalar: a,
    bScalar: b,
    cScalar: c,
  };
}

// ---------------------------------------------------------------------
// Contract wrapper
// ---------------------------------------------------------------------

export class Groth16Verifier implements Contract {
  static readonly OP_VERIFY_CLAIM = GROTH16_OP_VERIFY_CLAIM;

  constructor(
    readonly address: Address,
    readonly init?: { code: Cell; data: Cell },
  ) {}

  static createFromAddress(address: Address): Groth16Verifier {
    return new Groth16Verifier(address);
  }

  static createFromConfig(code: Cell, workchain = 0): Groth16Verifier {
    const data = beginCell().endCell();
    const init = { code, data };
    return new Groth16Verifier(contractAddress(workchain, init), init);
  }

  async sendDeploy(
    provider: ContractProvider,
    via: Sender,
    value: bigint,
  ): Promise<void> {
    await provider.internal(via, {
      value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell().endCell(),
    });
  }

  async sendVerifyClaim(
    provider: ContractProvider,
    via: Sender,
    opts: {
      value: bigint;
      queryId: bigint;
      proof: Groth16Proof;
      publicInputs: PublicInputs;
    },
  ): Promise<void> {
    if (opts.proof.a.length !== 48)
      throw new Error("proof.a must be 48 bytes");
    if (opts.proof.b.length !== 96)
      throw new Error("proof.b must be 96 bytes");
    if (opts.proof.c.length !== 48)
      throw new Error("proof.c must be 48 bytes");

    const body = beginCell()
      .storeUint(GROTH16_OP_VERIFY_CLAIM, 32)
      .storeUint(opts.queryId, 64)
      .storeRef(beginCell().storeBuffer(opts.proof.a).endCell())
      .storeRef(beginCell().storeBuffer(opts.proof.b).endCell())
      .storeRef(beginCell().storeBuffer(opts.proof.c).endCell())
      .storeRef(buildPublicInputsCell(opts.publicInputs))
      .endCell();

    await provider.internal(via, {
      value: opts.value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body,
    });
  }

  async getNullifierUsed(
    provider: ContractProvider,
    nf: bigint,
  ): Promise<boolean> {
    const { stack } = await provider.get("nullifier_used?", [
      { type: "int", value: nf },
    ]);
    return stack.readNumber() !== 0;
  }

  async getChainId(provider: ContractProvider): Promise<bigint> {
    const { stack } = await provider.get("chain_id", []);
    return stack.readBigNumber();
  }
}
