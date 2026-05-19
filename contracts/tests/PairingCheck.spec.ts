import { Blockchain, SandboxContract, TreasuryContract } from "@ton/sandbox";
import { Cell, toNano } from "@ton/core";
import { compile } from "@ton/blueprint";
import { bls12_381 } from "@noble/curves/bls12-381";
import "@ton/test-utils";

import { PairingCheck, buildPairingMessageBody } from "../wrappers/PairingCheck";

type G1 = typeof bls12_381.G1.ProjectivePoint.BASE;
type G2 = typeof bls12_381.G2.ProjectivePoint.BASE;

const G1_GEN: G1 = bls12_381.G1.ProjectivePoint.BASE;
const G2_GEN: G2 = bls12_381.G2.ProjectivePoint.BASE;

function g1Bytes(p: G1): Buffer {
  return Buffer.from(p.toRawBytes(true));
}

function g2Bytes(p: G2): Buffer {
  return Buffer.from(p.toRawBytes(true));
}

describe("PairingCheck", () => {
  let code: Cell;

  beforeAll(async () => {
    code = await compile("PairingCheck");
  });

  let blockchain: Blockchain;
  let deployer: SandboxContract<TreasuryContract>;
  let pairing: SandboxContract<PairingCheck>;

  beforeEach(async () => {
    blockchain = await Blockchain.create();
    deployer = await blockchain.treasury("deployer");
    pairing = blockchain.openContract(
      PairingCheck.createFromConfig({}, code),
    );
    const r = await pairing.sendDeploy(deployer.getSender(), toNano("0.05"));
    expect(r.transactions).toHaveTransaction({
      from: deployer.address,
      to: pairing.address,
      deploy: true,
      success: true,
    });
  });

  it("accepts a known-good pairing (e(aG1, bG2) == e(abG1, G2))", async () => {
    const a = 3n;
    const b = 5n;
    const ab = a * b;

    const p1 = G1_GEN.multiply(a);
    const q1 = G2_GEN.multiply(b);
    const p2 = G1_GEN.multiply(ab);
    const q2 = G2_GEN;

    const r = await pairing.sendCheckPairing(deployer.getSender(), {
      value: toNano("0.2"),
      queryId: 1n,
      p1: g1Bytes(p1),
      q1: g2Bytes(q1),
      p2: g1Bytes(p2),
      q2: g2Bytes(q2),
    });

    const tx = r.transactions.find(
      (t) => t.inMessage?.info.dest?.toString() === pairing.address.toString(),
    );
    expect(tx).toBeDefined();
    expect((tx as any).description?.computePhase?.success).toBe(true);

    const result = await pairing.getLastResult();
    const qid = await pairing.getLastQueryId();
    expect(result).toBe(1);
    expect(qid).toBe(1n);

    // eslint-disable-next-line no-console
    console.log(
      "[gas] known-good:",
      (tx as any).description?.computePhase?.gasUsed?.toString?.() ?? "n/a",
    );
  });

  it("rejects a known-bad pairing (e(G1, G2) != e(G1, 2G2))", async () => {
    const p1 = G1_GEN;
    const q1 = G2_GEN;
    const p2 = G1_GEN;
    const q2 = G2_GEN.multiply(2n);

    const r = await pairing.sendCheckPairing(deployer.getSender(), {
      value: toNano("0.2"),
      queryId: 2n,
      p1: g1Bytes(p1),
      q1: g2Bytes(q1),
      p2: g1Bytes(p2),
      q2: g2Bytes(q2),
    });

    const tx = r.transactions.find(
      (t) => t.inMessage?.info.dest?.toString() === pairing.address.toString(),
    );
    expect(tx).toBeDefined();
    expect((tx as any).description?.computePhase?.success).toBe(true);

    const result = await pairing.getLastResult();
    const qid = await pairing.getLastQueryId();
    expect(result).toBe(0);
    expect(qid).toBe(2n);

    // eslint-disable-next-line no-console
    console.log(
      "[gas] known-bad:",
      (tx as any).description?.computePhase?.gasUsed?.toString?.() ?? "n/a",
    );
  });

  it("rejects malformed point (wrong byte length)", async () => {
    // Build the message body manually with a 32-byte 'G1' point to
    // trigger err::malformed (901).
    const badP1 = Buffer.alloc(32, 0xab);
    const body = buildPairingMessageBodyRaw({
      queryId: 3n,
      p1: badP1,
      q1: g2Bytes(G2_GEN),
      p2: g1Bytes(G1_GEN),
      q2: g2Bytes(G2_GEN),
    });

    const r = await deployer.send({
      to: pairing.address,
      value: toNano("0.2"),
      body,
    });

    const tx = r.transactions.find(
      (t) => t.inMessage?.info.dest?.toString() === pairing.address.toString(),
    );
    expect(tx).toBeDefined();
    expect((tx as any).description?.computePhase?.exitCode).toBe(901);
  });
});

// Helper that mirrors buildPairingMessageBody but skips the length
// assertion on point buffers — used to construct intentionally malformed
// inputs for failure-path tests.
function buildPairingMessageBodyRaw(opts: {
  queryId: bigint;
  p1: Buffer;
  q1: Buffer;
  p2: Buffer;
  q2: Buffer;
}): Cell {
  const { beginCell } = require("@ton/core");
  return beginCell()
    .storeUint(0x70a17001, 32)
    .storeUint(opts.queryId, 64)
    .storeRef(beginCell().storeBuffer(opts.p1).endCell())
    .storeRef(beginCell().storeBuffer(opts.q1).endCell())
    .storeRef(beginCell().storeBuffer(opts.p2).endCell())
    .storeRef(beginCell().storeBuffer(opts.q2).endCell())
    .endCell();
}
