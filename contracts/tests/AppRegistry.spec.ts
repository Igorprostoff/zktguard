import { Blockchain, SandboxContract, TreasuryContract } from "@ton/sandbox";
import { Cell, toNano } from "@ton/core";
import { compile } from "@ton/blueprint";
import "@ton/test-utils";

import { AppRegistry, REGISTRY_OP_REGISTER } from "../wrappers/AppRegistry";

describe("AppRegistry", () => {
  let code: Cell;
  beforeAll(async () => {
    code = await compile("AppRegistry");
  });

  let blockchain: Blockchain;
  let admin: SandboxContract<TreasuryContract>;
  let intruder: SandboxContract<TreasuryContract>;
  let registry: SandboxContract<AppRegistry>;

  beforeEach(async () => {
    blockchain = await Blockchain.create();
    admin = await blockchain.treasury("admin");
    intruder = await blockchain.treasury("intruder");
    registry = blockchain.openContract(
      AppRegistry.createFromConfig({ admin: admin.address }, code),
    );
    const r = await registry.sendDeploy(admin.getSender(), toNano("0.05"));
    expect(r.transactions).toHaveTransaction({
      from: admin.address,
      to: registry.address,
      deploy: true,
      success: true,
    });
  });

  it("starts with an empty registry and the deployer as admin", async () => {
    expect(await registry.getIsRegistered(1n, 1n)).toBe(false);
    expect((await registry.getAdmin()).toString()).toBe(admin.address.toString());
  });

  it("registers a (app_id, claim_type) pair when admin sends op::register", async () => {
    await registry.sendRegister(admin.getSender(), {
      value: toNano("0.05"),
      queryId: 1n,
      appId: 1n,
      claimType: 1n,
    });
    expect(await registry.getIsRegistered(1n, 1n)).toBe(true);
    expect(await registry.getIsRegistered(1n, 2n)).toBe(false);
    expect(await registry.getIsRegistered(2n, 1n)).toBe(false);
  });

  it("treats register as idempotent (no-op on duplicate)", async () => {
    await registry.sendRegister(admin.getSender(), {
      value: toNano("0.05"),
      queryId: 1n,
      appId: 7n,
      claimType: 3n,
    });
    const r = await registry.sendRegister(admin.getSender(), {
      value: toNano("0.05"),
      queryId: 2n,
      appId: 7n,
      claimType: 3n,
    });
    expect(r.transactions).toHaveTransaction({
      from: admin.address,
      to: registry.address,
      success: true,
    });
    expect(await registry.getIsRegistered(7n, 3n)).toBe(true);
  });

  it("rejects op::register from a non-admin with exit 420", async () => {
    const r = await registry.sendRegister(intruder.getSender(), {
      value: toNano("0.05"),
      queryId: 1n,
      appId: 1n,
      claimType: 1n,
    });
    const tx = r.transactions.find(
      (t) => t.inMessage?.info.dest?.toString() === registry.address.toString(),
    );
    expect((tx as any).description?.computePhase?.exitCode).toBe(420);
    expect(await registry.getIsRegistered(1n, 1n)).toBe(false);
  });

  it("deregisters a pair", async () => {
    await registry.sendRegister(admin.getSender(), {
      value: toNano("0.05"),
      queryId: 1n,
      appId: 1n,
      claimType: 1n,
    });
    expect(await registry.getIsRegistered(1n, 1n)).toBe(true);
    await registry.sendDeregister(admin.getSender(), {
      value: toNano("0.05"),
      queryId: 2n,
      appId: 1n,
      claimType: 1n,
    });
    expect(await registry.getIsRegistered(1n, 1n)).toBe(false);
  });

  it("transfers admin to a new address", async () => {
    const next = await blockchain.treasury("next_admin");
    await registry.sendTransferAdmin(admin.getSender(), {
      value: toNano("0.05"),
      queryId: 1n,
      newAdmin: next.address,
    });
    expect((await registry.getAdmin()).toString()).toBe(next.address.toString());

    // Original admin no longer authorized.
    const r = await registry.sendRegister(admin.getSender(), {
      value: toNano("0.05"),
      queryId: 9n,
      appId: 1n,
      claimType: 1n,
    });
    const tx = r.transactions.find(
      (t) => t.inMessage?.info.dest?.toString() === registry.address.toString(),
    );
    expect((tx as any).description?.computePhase?.exitCode).toBe(420);
  });

  it("uses the documented op constant for register", () => {
    expect(REGISTRY_OP_REGISTER).toBe(0x72656769);
  });
});
