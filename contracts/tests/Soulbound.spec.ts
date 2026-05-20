import { Blockchain, SandboxContract, TreasuryContract } from "@ton/sandbox";
import { Address, beginCell, Cell, toNano } from "@ton/core";
import { compile } from "@ton/blueprint";
import "@ton/test-utils";

import {
  SoulboundCollection,
  computeItemAddress,
  COLLECTION_OP_MINT,
} from "../wrappers/SoulboundCollection";
import {
  SoulboundItem,
  buildIndividualContent,
  parseIndividualContent,
  IndividualContent,
  ITEM_OP_TRANSFER,
} from "../wrappers/SoulboundItem";

describe("Soulbound credential (Collection + Item)", () => {
  let collectionCode: Cell;
  let itemCode: Cell;

  beforeAll(async () => {
    collectionCode = await compile("SoulboundCollection");
    itemCode = await compile("SoulboundItem");
  });

  let blockchain: Blockchain;
  let deployer: SandboxContract<TreasuryContract>;
  let verifier: SandboxContract<TreasuryContract>;
  let intruder: SandboxContract<TreasuryContract>;
  let user: SandboxContract<TreasuryContract>;
  let collection: SandboxContract<SoulboundCollection>;

  beforeEach(async () => {
    blockchain = await Blockchain.create();
    deployer = await blockchain.treasury("deployer");
    verifier = await blockchain.treasury("verifier_stand_in");
    intruder = await blockchain.treasury("intruder");
    user = await blockchain.treasury("user");

    collection = blockchain.openContract(
      SoulboundCollection.createFromConfig(
        {
          verifier: verifier.address,
          owner: deployer.address,
          content: beginCell().storeUint(0, 8).endCell(),
          itemCode,
        },
        collectionCode,
      ),
    );

    const r = await collection.sendDeploy(deployer.getSender(), toNano("0.1"));
    expect(r.transactions).toHaveTransaction({
      from: deployer.address,
      to: collection.address,
      deploy: true,
      success: true,
    });
  });

  function sampleContent(): IndividualContent {
    return {
      app_id: 1n,
      claim_type: 1n,
      expiration: 2_000_000_000n,
      claim_hash: 0xdeadbeefcafebaben,
      mint_timestamp: 1_700_000_000n,
    };
  }

  it("mints an Item when the verifier sends op::mint", async () => {
    const content = sampleContent();
    const contentCell = buildIndividualContent(content);

    const expectedItemAddr = computeItemAddress(
      itemCode,
      0n,
      collection.address,
      user.address,
      contentCell,
    );

    const r = await collection.sendMint(verifier.getSender(), {
      value: toNano("0.2"),
      queryId: 1n,
      newOwner: user.address,
      content,
    });

    expect(r.transactions).toHaveTransaction({
      from: verifier.address,
      to: collection.address,
      success: true,
    });
    expect(r.transactions).toHaveTransaction({
      from: collection.address,
      to: expectedItemAddr,
      deploy: true,
      success: true,
    });

    expect(await collection.getNextIndex()).toBe(1n);

    const item = blockchain.openContract(
      SoulboundItem.createFromAddress(expectedItemAddr),
    );
    const data = await item.getNftData();
    expect(data.init).toBe(true);
    expect(data.index).toBe(0n);
    expect(data.collection.toString()).toBe(collection.address.toString());
    expect(data.owner.toString()).toBe(user.address.toString());

    const parsed = parseIndividualContent(data.content);
    expect(parsed).toEqual(content);
  });

  it("rejects mint from anyone other than the verifier (411)", async () => {
    const r = await collection.sendMint(intruder.getSender(), {
      value: toNano("0.2"),
      queryId: 2n,
      newOwner: user.address,
      content: sampleContent(),
    });
    const tx = r.transactions.find(
      (t) => t.inMessage?.info.dest?.toString() === collection.address.toString(),
    );
    expect((tx as any).description?.computePhase?.exitCode).toBe(411);
    expect(await collection.getNextIndex()).toBe(0n);
  });

  it("rejects a transfer attempt on a minted Item with exit 410", async () => {
    // Mint first
    const content = sampleContent();
    const contentCell = buildIndividualContent(content);
    await collection.sendMint(verifier.getSender(), {
      value: toNano("0.2"),
      queryId: 10n,
      newOwner: user.address,
      content,
    });
    const itemAddr = computeItemAddress(
      itemCode,
      0n,
      collection.address,
      user.address,
      contentCell,
    );
    const item = blockchain.openContract(
      SoulboundItem.createFromAddress(itemAddr),
    );

    const newOwner = await blockchain.treasury("newOwner");
    const r = await item.sendTransfer(user.getSender(), {
      value: toNano("0.1"),
      queryId: 99n,
      newOwner: newOwner.address,
    });
    const tx = r.transactions.find(
      (t) => t.inMessage?.info.dest?.toString() === itemAddr.toString(),
    );
    expect((tx as any).description?.computePhase?.exitCode).toBe(410);

    const data = await item.getNftData();
    expect(data.owner.toString()).toBe(user.address.toString());
  });

  it("exposes the verifier address via getter", async () => {
    const v = await collection.getVerifierAddress();
    expect(v.toString()).toBe(verifier.address.toString());
  });

  it("encodes op::mint stably (0x6d696e74)", () => {
    expect(COLLECTION_OP_MINT).toBe(0x6d696e74);
    expect(ITEM_OP_TRANSFER).toBe(0x5fcc3d14);
  });
});
