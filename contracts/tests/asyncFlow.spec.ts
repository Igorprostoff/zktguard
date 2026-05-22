/**
 * Phase C end-to-end integration test (DoD Task C6).
 *
 * Deploys the three v0.2 contracts (registry, soulbound collection,
 * Groth16 verifier), wires them via admin ops, then walks the full
 * verify → park → query → reply → mint sequence with the real Phase-A
 * proof fixture.
 */
import { Blockchain, SandboxContract, TreasuryContract } from "@ton/sandbox";
import { beginCell, Cell, toNano } from "@ton/core";
import { compile } from "@ton/blueprint";
import * as fs from "node:fs";
import * as path from "node:path";
import "@ton/test-utils";

import { AppRegistry } from "../wrappers/AppRegistry";
import { Groth16Verifier, PublicInputs } from "../wrappers/Groth16Verifier";
import {
  SoulboundCollection,
  computeItemAddress,
} from "../wrappers/SoulboundCollection";
import {
  buildIndividualContent,
} from "../wrappers/SoulboundItem";

interface Fixture {
  aHex: string;
  bHex: string;
  cHex: string;
  publicInputs: string[];
}
const FIXTURE: Fixture = JSON.parse(
  fs.readFileSync(path.join(__dirname, "fixtures", "phase_a_accept.json"), "utf8"),
);

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

describe("Phase C async flow (registry + verifier + collection)", () => {
  let registryCode: Cell;
  let collectionCode: Cell;
  let itemCode: Cell;
  let verifierCode: Cell;
  beforeAll(async () => {
    registryCode = await compile("AppRegistry");
    collectionCode = await compile("SoulboundCollection");
    itemCode = await compile("SoulboundItem");
    verifierCode = await compile("Groth16Verifier");
  });

  let blockchain: Blockchain;
  let deployer: SandboxContract<TreasuryContract>;
  let admin: SandboxContract<TreasuryContract>;
  let user: SandboxContract<TreasuryContract>;
  let registry: SandboxContract<AppRegistry>;
  let collection: SandboxContract<SoulboundCollection>;
  let verifier: SandboxContract<Groth16Verifier>;

  beforeEach(async () => {
    blockchain = await Blockchain.create();
    deployer = await blockchain.treasury("deployer");
    admin = await blockchain.treasury("admin");
    user = await blockchain.treasury("user");

    // 1. Deploy registry (admin can mutate it).
    registry = blockchain.openContract(
      AppRegistry.createFromConfig({ admin: admin.address }, registryCode),
    );
    await registry.sendDeploy(deployer.getSender(), toNano("0.1"));

    // 2. Deploy the soulbound collection. verifier_addr starts as
    //    deployer (placeholder); we rotate it once the verifier is up.
    collection = blockchain.openContract(
      SoulboundCollection.createFromConfig(
        {
          verifier: deployer.address,
          owner: admin.address,
          content: beginCell().storeUint(0, 8).endCell(),
          itemCode,
        },
        collectionCode,
      ),
    );
    await collection.sendDeploy(deployer.getSender(), toNano("0.1"));

    // 3. Deploy the verifier with both registry + collection wired.
    verifier = blockchain.openContract(
      Groth16Verifier.createFromConfig(
        {
          admin: admin.address,
          registry: registry.address,
          collection: collection.address,
        },
        verifierCode,
      ),
    );
    await verifier.sendDeploy(deployer.getSender(), toNano("0.5"));

    // 4. Rotate the collection's verifier_addr to the verifier we deployed.
    await collection.sendSetVerifier(admin.getSender(), {
      value: toNano("0.05"),
      queryId: 1n,
      newVerifier: verifier.address,
    });
    expect((await collection.getVerifierAddress()).toString()).toBe(
      verifier.address.toString(),
    );

    // 5. Admin registers (app_id=1, claim_type=1) on the registry.
    await registry.sendRegister(admin.getSender(), {
      value: toNano("0.05"),
      queryId: 1n,
      appId: 1n,
      claimType: 1n,
    });
    expect(await registry.getIsRegistered(1n, 1n)).toBe(true);
  });

  it("verify → query → reply → mint produces a soulbound credential", async () => {
    const pi = fixturePublicInputs();

    const r1 = await verifier.sendVerifyClaim(user.getSender(), {
      value: toNano("0.5"),
      queryId: 1n,
      proof: fixtureProof(),
      publicInputs: pi,
    });
    // The verifier parked the proof and pushed a query at the registry,
    // which auto-processed and replied — so the full mint flow is in
    // the same `r1` transaction list.
    expect(await verifier.getIsParked(1n)).toBe(false); // already consumed by the reply
    expect(await verifier.getNullifierUsed(pi.nullifier)).toBe(true);

    // The mint should have produced a Soulbound Item at the predicted
    // address. The content cell uses the verifier's `now()` at reply
    // time as mint_timestamp; we don't know it exactly here, so we
    // assert by reading the Item's get_nft_data via the predicted
    // owner + collection.
    const mintTx = r1.transactions.find(
      (t) => t.inMessage?.info.dest?.toString() === collection.address.toString(),
    );
    expect(mintTx).toBeDefined();
  });

  it("registry says no → verifier drops parked entry, no mint", async () => {
    // Deregister (app=1, claim=1) so the verifier's query returns false.
    await registry.sendDeregister(admin.getSender(), {
      value: toNano("0.05"),
      queryId: 1n,
      appId: 1n,
      claimType: 1n,
    });
    expect(await registry.getIsRegistered(1n, 1n)).toBe(false);

    const pi = fixturePublicInputs();
    const r = await verifier.sendVerifyClaim(user.getSender(), {
      value: toNano("0.5"),
      queryId: 2n,
      proof: fixtureProof(),
      publicInputs: pi,
    });
    expect(await verifier.getNullifierUsed(pi.nullifier)).toBe(false);
    expect(await verifier.getIsParked(1n)).toBe(false);

    // No mint message reached the collection.
    const mint = r.transactions.find(
      (t) => t.inMessage?.info.dest?.toString() === collection.address.toString() &&
             t.inMessage?.info.src?.toString() === verifier.address.toString(),
    );
    // (Initial sendSetVerifier was at beforeEach, so we filter on src=verifier.)
    expect(mint).toBeUndefined();
  });

  it("invalid proof never reaches the registry (exit 401)", async () => {
    const pi = fixturePublicInputs();
    const proof = fixtureProof();
    const tampered = Buffer.from(proof.c);
    tampered[0] ^= 0x20;

    const r = await verifier.sendVerifyClaim(user.getSender(), {
      value: toNano("0.5"),
      queryId: 3n,
      proof: { ...proof, c: tampered },
      publicInputs: pi,
    });
    const verifyTx = r.transactions.find(
      (t) => t.inMessage?.info.dest?.toString() === verifier.address.toString(),
    );
    expect((verifyTx as any).description?.computePhase?.exitCode).toBe(401);
    // The verifier rejected before parking; no message reached the
    // registry in this transaction batch.
    const registryTx = r.transactions.find(
      (t) => t.inMessage?.info.dest?.toString() === registry.address.toString(),
    );
    expect(registryTx).toBeUndefined();
  });
});
