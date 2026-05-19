import { Blockchain, SandboxContract, TreasuryContract } from "@ton/sandbox";
import { beginCell, Cell, toNano } from "@ton/core";
import { compile } from "@ton/blueprint";
import "@ton/test-utils";

import {
  Groth16Verifier,
  PublicInputs,
  buildPublicInputsCell,
  craftSyntheticProof,
  packNonce,
  GROTH16_OP_VERIFY_CLAIM,
} from "../wrappers/Groth16Verifier";

const ACCEPTED_APP_ID = 1n;
const ACCEPTED_CLAIM = 1n;
const CHAIN_ID = 1n;

function basePublicInputs(overrides: Partial<PublicInputs> = {}): PublicInputs {
  const base: PublicInputs = {
    nonce: packNonce(CHAIN_ID, 0xdead_beefn),
    app_id: ACCEPTED_APP_ID,
    expiration: BigInt(2 ** 31 - 1), // far future
    claim_type: ACCEPTED_CLAIM,
    nullifier: 0x1234_5678_9abc_def0n,
    attestor_pubkey_x: 0x5n,
    attestor_pubkey_y: 0x7n,
    threshold_months: 6n,
  };
  return { ...base, ...overrides };
}

describe("Groth16Verifier", () => {
  let code: Cell;
  beforeAll(async () => {
    code = await compile("Groth16Verifier");
  });

  let blockchain: Blockchain;
  let deployer: SandboxContract<TreasuryContract>;
  let verifier: SandboxContract<Groth16Verifier>;

  beforeEach(async () => {
    blockchain = await Blockchain.create();
    deployer = await blockchain.treasury("deployer");
    verifier = blockchain.openContract(Groth16Verifier.createFromConfig(code));
    const r = await verifier.sendDeploy(deployer.getSender(), toNano("0.05"));
    expect(r.transactions).toHaveTransaction({
      from: deployer.address,
      to: verifier.address,
      deploy: true,
      success: true,
    });
  });

  it("accepts a valid synthetic proof under the placeholder VK", async () => {
    const pi = basePublicInputs();
    const proof = craftSyntheticProof(pi);

    const r = await verifier.sendVerifyClaim(deployer.getSender(), {
      value: toNano("0.5"),
      queryId: 1n,
      proof,
      publicInputs: pi,
    });

    const tx = r.transactions.find(
      (t) => t.inMessage?.info.dest?.toString() === verifier.address.toString(),
    );
    expect(tx).toBeDefined();
    expect((tx as any).description?.computePhase?.success).toBe(true);
    expect(await verifier.getNullifierUsed(pi.nullifier)).toBe(true);

    // eslint-disable-next-line no-console
    console.log(
      "[gas] verify (accept):",
      (tx as any).description?.computePhase?.gasUsed?.toString?.() ?? "n/a",
    );
  });

  it("rejects a proof with a flipped C byte with exit 401", async () => {
    const pi = basePublicInputs({ nullifier: 0x401_aaaa_bbbb_ccccn });
    const proof = craftSyntheticProof(pi);

    // Flip the high byte of C — still on-curve only by accident; the
    // BLS_G1_INGROUP filter catches most random tampering, so we make
    // the flip subtler by toggling the sign-of-y compression flag.
    const tampered = Buffer.from(proof.c);
    tampered[0] ^= 0x20; // toggle Y sign bit on compressed G1
    const badProof = { ...proof, c: tampered };

    const r = await verifier.sendVerifyClaim(deployer.getSender(), {
      value: toNano("0.5"),
      queryId: 2n,
      proof: badProof,
      publicInputs: pi,
    });

    const tx = r.transactions.find(
      (t) => t.inMessage?.info.dest?.toString() === verifier.address.toString(),
    );
    expect(tx).toBeDefined();
    const exit = (tx as any).description?.computePhase?.exitCode;
    expect(exit).toBe(401);
    expect(await verifier.getNullifierUsed(pi.nullifier)).toBe(false);
  });

  it("rejects a replayed nullifier with exit 402", async () => {
    const pi = basePublicInputs({ nullifier: 0x402_cafe_babe_0001n });
    const proof = craftSyntheticProof(pi);

    const first = await verifier.sendVerifyClaim(deployer.getSender(), {
      value: toNano("0.5"),
      queryId: 10n,
      proof,
      publicInputs: pi,
    });
    expect(
      (first.transactions.find(
        (t) =>
          t.inMessage?.info.dest?.toString() === verifier.address.toString(),
      ) as any)?.description?.computePhase?.success,
    ).toBe(true);

    // Same proof and nullifier again: should fail with 402 before
    // touching the pairing opcode.
    const second = await verifier.sendVerifyClaim(deployer.getSender(), {
      value: toNano("0.5"),
      queryId: 11n,
      proof,
      publicInputs: pi,
    });
    const tx2 = second.transactions.find(
      (t) => t.inMessage?.info.dest?.toString() === verifier.address.toString(),
    );
    expect((tx2 as any).description?.computePhase?.exitCode).toBe(402);
  });

  it("rejects an expired proof with exit 403", async () => {
    const pi = basePublicInputs({
      nullifier: 0x403_0000_0000_aaaan,
      expiration: 1n, // 1970-01-01 plus a second — far in the past
    });
    const proof = craftSyntheticProof(pi);

    const r = await verifier.sendVerifyClaim(deployer.getSender(), {
      value: toNano("0.5"),
      queryId: 20n,
      proof,
      publicInputs: pi,
    });
    const tx = r.transactions.find(
      (t) => t.inMessage?.info.dest?.toString() === verifier.address.toString(),
    );
    expect((tx as any).description?.computePhase?.exitCode).toBe(403);
  });

  it("rejects an unknown app_id with exit 404", async () => {
    const pi = basePublicInputs({
      nullifier: 0x404_0000_0000_aaaan,
      app_id: 999n,
    });
    const proof = craftSyntheticProof(pi);

    const r = await verifier.sendVerifyClaim(deployer.getSender(), {
      value: toNano("0.5"),
      queryId: 30n,
      proof,
      publicInputs: pi,
    });
    const tx = r.transactions.find(
      (t) => t.inMessage?.info.dest?.toString() === verifier.address.toString(),
    );
    expect((tx as any).description?.computePhase?.exitCode).toBe(404);
  });

  it("rejects a chain_id mismatch with exit 405", async () => {
    const pi = basePublicInputs({
      nullifier: 0x405_0000_0000_aaaan,
      nonce: packNonce(2n, 0xfeedn), // chain_id 2 ≠ contract's 1
    });
    const proof = craftSyntheticProof(pi);

    const r = await verifier.sendVerifyClaim(deployer.getSender(), {
      value: toNano("0.5"),
      queryId: 40n,
      proof,
      publicInputs: pi,
    });
    const tx = r.transactions.find(
      (t) => t.inMessage?.info.dest?.toString() === verifier.address.toString(),
    );
    expect((tx as any).description?.computePhase?.exitCode).toBe(405);
  });

  it("encodes the public-input cell snake stably (3 + 3 + 2)", () => {
    const pi = basePublicInputs();
    const head = buildPublicInputsCell(pi);
    expect(head.bits.length).toBe(3 * 256);
    expect(head.refs.length).toBe(1);
    const c1 = head.refs[0];
    expect(c1.bits.length).toBe(3 * 256);
    expect(c1.refs.length).toBe(1);
    const c2 = c1.refs[0];
    expect(c2.bits.length).toBe(2 * 256);
    expect(c2.refs.length).toBe(0);
  });

  it("exposes the op constant via the wrapper", () => {
    expect(GROTH16_OP_VERIFY_CLAIM).toBe(0x76657266);
  });
});
