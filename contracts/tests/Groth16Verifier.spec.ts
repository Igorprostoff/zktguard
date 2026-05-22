import { Blockchain, SandboxContract, TreasuryContract } from "@ton/sandbox";
import { beginCell, Cell, toNano } from "@ton/core";
import { compile } from "@ton/blueprint";
import * as fs from "node:fs";
import * as path from "node:path";
import "@ton/test-utils";

import {
  Groth16Verifier,
  PublicInputs,
  buildPublicInputsCell,
  GROTH16_OP_VERIFY_CLAIM,
  packNonce,
} from "../wrappers/Groth16Verifier";

interface Fixture {
  aHex: string;
  bHex: string;
  cHex: string;
  publicInputs: string[];
}

const FIXTURE: Fixture = JSON.parse(
  fs.readFileSync(path.join(__dirname, "fixtures", "phase_a_accept.json"), "utf8"),
);

// v0.2 Phase-A public-input order (output-first):
//   pi[0] = nullifier
//   pi[1] = nonce
//   pi[2] = app_id
//   pi[3] = expiration
//   pi[4] = claim_type
//   pi[5] = attestor_pubkey_x
//   pi[6] = attestor_pubkey_y
//   pi[7] = threshold_months

function fixturePublicInputs(): PublicInputs {
  const v = FIXTURE.publicInputs.map((s) => BigInt(s));
  return {
    nullifier: v[0],
    nonce: v[1],
    app_id: v[2],
    expiration: v[3],
    claim_type: v[4],
    attestor_pubkey_x: v[5],
    attestor_pubkey_y: v[6],
    threshold_months: v[7],
  };
}

function fixtureProof() {
  return {
    a: Buffer.from(FIXTURE.aHex, "hex"),
    b: Buffer.from(FIXTURE.bHex, "hex"),
    c: Buffer.from(FIXTURE.cHex, "hex"),
  };
}

describe("Groth16Verifier (v0.2 Phase A, real proof fixture)", () => {
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

  it("accepts the fixture proof against the real Phase-A VK", async () => {
    const pi = fixturePublicInputs();
    const proof = fixtureProof();

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
    const pi = fixturePublicInputs();
    const proof = fixtureProof();
    // Toggle the Y-sign compression flag on C. The point stays on
    // curve (just negated) so the BLS_G1_INGROUP filter passes, and
    // only the pairing equation fails.
    const tampered = Buffer.from(proof.c);
    tampered[0] ^= 0x20;
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
    expect((tx as any).description?.computePhase?.exitCode).toBe(401);
    expect(await verifier.getNullifierUsed(pi.nullifier)).toBe(false);
  });

  it("rejects a replayed nullifier with exit 402", async () => {
    const pi = fixturePublicInputs();
    const proof = fixtureProof();

    const first = await verifier.sendVerifyClaim(deployer.getSender(), {
      value: toNano("0.5"),
      queryId: 10n,
      proof,
      publicInputs: pi,
    });
    expect(
      (first.transactions.find(
        (t) => t.inMessage?.info.dest?.toString() === verifier.address.toString(),
      ) as any)?.description?.computePhase?.success,
    ).toBe(true);

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
    const pi = { ...fixturePublicInputs(), expiration: 1n };
    const proof = fixtureProof();

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
    const pi = { ...fixturePublicInputs(), app_id: 999n };
    const proof = fixtureProof();

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
    const pi = { ...fixturePublicInputs(), nonce: packNonce(2n, 0xfeedn) };
    const proof = fixtureProof();

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
    const pi = fixturePublicInputs();
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
