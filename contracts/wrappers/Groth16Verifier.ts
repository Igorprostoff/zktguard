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

export const GROTH16_OP_VERIFY_CLAIM = 0x76657266;

// ---------------------------------------------------------------------
// Public input encoding (8 × 256-bit scalars, snake of 3 + 3 + 2 cells)
//
// v0.2 Phase A: nullifier is the circuit's output and therefore the
// FIRST public signal in the proof's public-input vector. The remaining
// seven follow the circuit's `public []` declaration order.
// ---------------------------------------------------------------------

export interface PublicInputs {
  nullifier: bigint;
  nonce: bigint;
  app_id: bigint;
  expiration: bigint;
  claim_type: bigint;
  attestor_pubkey_x: bigint;
  attestor_pubkey_y: bigint;
  threshold_months: bigint;
}

export function publicInputsToVector(pi: PublicInputs): bigint[] {
  return [
    pi.nullifier,
    pi.nonce,
    pi.app_id,
    pi.expiration,
    pi.claim_type,
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
// Proof shape
// ---------------------------------------------------------------------

export interface Groth16Proof {
  a: Buffer; // 48 bytes (G1 compressed)
  b: Buffer; // 96 bytes (G2 compressed)
  c: Buffer; // 48 bytes (G1 compressed)
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
