import { Blockchain, SandboxContract, TreasuryContract } from "@ton/sandbox";
import { beginCell, Cell, toNano } from "@ton/core";
import { compile } from "@ton/blueprint";
import * as fs from "node:fs";
import * as path from "node:path";
import "@ton/test-utils";

import {
  Groth16Verifier,
  PublicInputs,
  GROTH16_OP_VERIFY_CLAIM,
  GROTH16_OP_QUERY_REPLY,
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

function buildQueryReply(opts: {
  queryId: bigint;
  appId: bigint;
  claimType: bigint;
  isRegistered: boolean;
}): Cell {
  return beginCell()
    .storeUint(GROTH16_OP_QUERY_REPLY, 32)
    .storeUint(opts.queryId, 64)
    .storeUint(opts.appId, 64)
    .storeUint(opts.claimType, 32)
    .storeUint(opts.isRegistered ? 1 : 0, 1)
    .endCell();
}

describe("Groth16Verifier (v0.2 Phase C async flow)", () => {
  let code: Cell;
  beforeAll(async () => {
    code = await compile("Groth16Verifier");
  });

  let blockchain: Blockchain;
  let deployer: SandboxContract<TreasuryContract>;
  let admin: SandboxContract<TreasuryContract>;
  let registry: SandboxContract<TreasuryContract>;
  let collection: SandboxContract<TreasuryContract>;
  let user: SandboxContract<TreasuryContract>;
  let verifier: SandboxContract<Groth16Verifier>;

  beforeEach(async () => {
    blockchain = await Blockchain.create();
    deployer = await blockchain.treasury("deployer");
    admin = await blockchain.treasury("admin");
    registry = await blockchain.treasury("registry_stub");
    collection = await blockchain.treasury("collection_stub");
    user = await blockchain.treasury("user");

    verifier = blockchain.openContract(
      Groth16Verifier.createFromConfig(
        {
          admin: admin.address,
          registry: registry.address,
          collection: collection.address,
        },
        code,
      ),
    );
    const r = await verifier.sendDeploy(deployer.getSender(), toNano("0.5"));
    expect(r.transactions).toHaveTransaction({
      from: deployer.address,
      to: verifier.address,
      deploy: true,
      success: true,
    });
  });

  it("parks the proof and sends op::query_registered to the registry", async () => {
    const pi = fixturePublicInputs();
    const proof = fixtureProof();

    const r = await verifier.sendVerifyClaim(user.getSender(), {
      value: toNano("0.5"),
      queryId: 99n,
      proof,
      publicInputs: pi,
    });

    const verifyTx = r.transactions.find(
      (t) => t.inMessage?.info.dest?.toString() === verifier.address.toString(),
    );
    expect((verifyTx as any).description?.computePhase?.success).toBe(true);

    // The verifier should have queued an outbound message to the
    // registry with op::query_registered.
    const out = r.transactions.find(
      (t) => t.inMessage?.info.dest?.toString() === registry.address.toString(),
    );
    expect(out).toBeDefined();

    expect(await verifier.getIsParked(1n)).toBe(true);
    expect(await verifier.getNextQueryId()).toBe(2n);
    // nullifier must NOT be recorded yet — happens on reply.
    expect(await verifier.getNullifierUsed(pi.nullifier)).toBe(false);

    // eslint-disable-next-line no-console
    console.log(
      "[gas] verify+park:",
      (verifyTx as any).description?.computePhase?.gasUsed?.toString?.() ?? "n/a",
    );
  });

  it("rejects a tampered proof with exit 401 before parking", async () => {
    const pi = fixturePublicInputs();
    const proof = fixtureProof();
    const tampered = Buffer.from(proof.c);
    tampered[0] ^= 0x20;
    const badProof = { ...proof, c: tampered };

    const r = await verifier.sendVerifyClaim(user.getSender(), {
      value: toNano("0.5"),
      queryId: 2n,
      proof: badProof,
      publicInputs: pi,
    });
    const tx = r.transactions.find(
      (t) => t.inMessage?.info.dest?.toString() === verifier.address.toString(),
    );
    expect((tx as any).description?.computePhase?.exitCode).toBe(401);
    expect(await verifier.getNextQueryId()).toBe(1n);
  });

  it("rejects an expired proof with exit 403", async () => {
    const pi = { ...fixturePublicInputs(), expiration: 1n };
    const proof = fixtureProof();
    const r = await verifier.sendVerifyClaim(user.getSender(), {
      value: toNano("0.5"),
      queryId: 3n,
      proof,
      publicInputs: pi,
    });
    const tx = r.transactions.find(
      (t) => t.inMessage?.info.dest?.toString() === verifier.address.toString(),
    );
    expect((tx as any).description?.computePhase?.exitCode).toBe(403);
  });

  it("rejects a chain_id mismatch with exit 405", async () => {
    const pi = { ...fixturePublicInputs(), nonce: packNonce(2n, 0xfeedn) };
    const proof = fixtureProof();
    const r = await verifier.sendVerifyClaim(user.getSender(), {
      value: toNano("0.5"),
      queryId: 4n,
      proof,
      publicInputs: pi,
    });
    const tx = r.transactions.find(
      (t) => t.inMessage?.info.dest?.toString() === verifier.address.toString(),
    );
    expect((tx as any).description?.computePhase?.exitCode).toBe(405);
  });

  it("completes the mint on a positive registry reply", async () => {
    const pi = fixturePublicInputs();
    const proof = fixtureProof();
    await verifier.sendVerifyClaim(user.getSender(), {
      value: toNano("0.5"),
      queryId: 1n,
      proof,
      publicInputs: pi,
    });
    expect(await verifier.getIsParked(1n)).toBe(true);

    // Simulate registry replying with is_registered=true.
    const replyBody = buildQueryReply({
      queryId: 1n,
      appId: pi.app_id,
      claimType: pi.claim_type,
      isRegistered: true,
    });
    const r = await registry.send({
      to: verifier.address,
      value: toNano("0.2"),
      body: replyBody,
    });
    const replyTx = r.transactions.find(
      (t) => t.inMessage?.info.dest?.toString() === verifier.address.toString(),
    );
    expect((replyTx as any).description?.computePhase?.success).toBe(true);
    expect(await verifier.getNullifierUsed(pi.nullifier)).toBe(true);
    expect(await verifier.getIsParked(1n)).toBe(false);

    // The verifier should have forwarded a mint message to the collection.
    const mint = r.transactions.find(
      (t) => t.inMessage?.info.dest?.toString() === collection.address.toString(),
    );
    expect(mint).toBeDefined();
  });

  it("drops parked entry on a negative registry reply, no mint sent", async () => {
    const pi = fixturePublicInputs();
    await verifier.sendVerifyClaim(user.getSender(), {
      value: toNano("0.5"),
      queryId: 1n,
      proof: fixtureProof(),
      publicInputs: pi,
    });

    const replyBody = buildQueryReply({
      queryId: 1n,
      appId: pi.app_id,
      claimType: pi.claim_type,
      isRegistered: false,
    });
    const r = await registry.send({
      to: verifier.address,
      value: toNano("0.2"),
      body: replyBody,
    });
    const replyTx = r.transactions.find(
      (t) => t.inMessage?.info.dest?.toString() === verifier.address.toString(),
    );
    expect((replyTx as any).description?.computePhase?.success).toBe(true);
    expect(await verifier.getNullifierUsed(pi.nullifier)).toBe(false);
    expect(await verifier.getIsParked(1n)).toBe(false);
    const mintTx = r.transactions.find(
      (t) => t.inMessage?.info.dest?.toString() === collection.address.toString(),
    );
    expect(mintTx).toBeUndefined();
  });

  it("rejects op::query_reply from a non-registry sender with exit 430", async () => {
    const pi = fixturePublicInputs();
    await verifier.sendVerifyClaim(user.getSender(), {
      value: toNano("0.5"),
      queryId: 1n,
      proof: fixtureProof(),
      publicInputs: pi,
    });

    const r = await user.send({
      to: verifier.address,
      value: toNano("0.2"),
      body: buildQueryReply({
        queryId: 1n,
        appId: pi.app_id,
        claimType: pi.claim_type,
        isRegistered: true,
      }),
    });
    const tx = r.transactions.find(
      (t) => t.inMessage?.info.dest?.toString() === verifier.address.toString(),
    );
    expect((tx as any).description?.computePhase?.exitCode).toBe(430);
  });

  it("rejects op::query_reply with an unknown query_id with exit 431", async () => {
    const r = await registry.send({
      to: verifier.address,
      value: toNano("0.2"),
      body: buildQueryReply({
        queryId: 9999n,
        appId: 1n,
        claimType: 1n,
        isRegistered: true,
      }),
    });
    const tx = r.transactions.find(
      (t) => t.inMessage?.info.dest?.toString() === verifier.address.toString(),
    );
    expect((tx as any).description?.computePhase?.exitCode).toBe(431);
  });

  it("rejects nullifier replay on a positive reply with exit 402", async () => {
    const pi = fixturePublicInputs();
    // Park + reply once.
    await verifier.sendVerifyClaim(user.getSender(), {
      value: toNano("0.5"),
      queryId: 1n,
      proof: fixtureProof(),
      publicInputs: pi,
    });
    await registry.send({
      to: verifier.address,
      value: toNano("0.2"),
      body: buildQueryReply({
        queryId: 1n,
        appId: pi.app_id,
        claimType: pi.claim_type,
        isRegistered: true,
      }),
    });
    expect(await verifier.getNullifierUsed(pi.nullifier)).toBe(true);

    // Re-park the same proof, then reply.
    await verifier.sendVerifyClaim(user.getSender(), {
      value: toNano("0.5"),
      queryId: 2n,
      proof: fixtureProof(),
      publicInputs: pi,
    });
    const r = await registry.send({
      to: verifier.address,
      value: toNano("0.2"),
      body: buildQueryReply({
        queryId: 2n,
        appId: pi.app_id,
        claimType: pi.claim_type,
        isRegistered: true,
      }),
    });
    const tx = r.transactions.find(
      (t) => t.inMessage?.info.dest?.toString() === verifier.address.toString(),
    );
    expect((tx as any).description?.computePhase?.exitCode).toBe(402);
  });

  it("exposes the op constant via the wrapper", () => {
    expect(GROTH16_OP_VERIFY_CLAIM).toBe(0x76657266);
  });
});
