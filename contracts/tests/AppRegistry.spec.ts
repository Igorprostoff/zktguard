import { Blockchain, SandboxContract, TreasuryContract } from "@ton/sandbox";
import { Cell, toNano } from "@ton/core";
import { compile } from "@ton/blueprint";
import "@ton/test-utils";

import { beginCell } from "@ton/core";
import {
  AppRegistry,
  REGISTRY_OP_REGISTER,
  REGISTRY_OP_QUERY_REGISTERED,
  REGISTRY_OP_QUERY_REPLY,
} from "../wrappers/AppRegistry";

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

  function findOutboundReply(txs: any[], from: any, to: any) {
    // The reply is the registry's outbound message → intruder.
    // We locate it by inspecting the registry transaction's outMessages
    // since the treasury contract on the receiving end re-wraps the body
    // and would otherwise hide the op code.
    const regTx = txs.find(
      (t) => t.inMessage?.info.dest?.toString() === from.address.toString(),
    );
    if (!regTx) return null;
    const outs: any[] = Array.from(regTx.outMessages?.values?.() ?? []);
    return outs.find(
      (m) => m.info.dest?.toString() === to.address.toString(),
    );
  }

  it("answers op::query_registered with op::query_reply (hit)", async () => {
    await registry.sendRegister(admin.getSender(), {
      value: toNano("0.05"),
      queryId: 1n,
      appId: 1n,
      claimType: 1n,
    });
    const queryBody = beginCell()
      .storeUint(REGISTRY_OP_QUERY_REGISTERED, 32)
      .storeUint(42n, 64)
      .storeUint(1n, 64)
      .storeUint(1n, 32)
      .endCell();
    const r = await intruder.send({
      to: registry.address,
      value: toNano("0.1"),
      body: queryBody,
    });
    const reply = findOutboundReply(r.transactions, registry, intruder);
    expect(reply).toBeTruthy();
    const body = reply!.body.beginParse();
    expect(body.loadUint(32)).toBe(REGISTRY_OP_QUERY_REPLY);
    expect(body.loadUintBig(64)).toBe(42n);
    expect(body.loadUintBig(64)).toBe(1n);
    expect(body.loadUintBig(32)).toBe(1n);
    expect(body.loadUint(1)).toBe(1);
  });

  it("answers op::query_registered with is_registered=false on miss", async () => {
    const queryBody = beginCell()
      .storeUint(REGISTRY_OP_QUERY_REGISTERED, 32)
      .storeUint(99n, 64)
      .storeUint(7n, 64)
      .storeUint(5n, 32)
      .endCell();
    const r = await intruder.send({
      to: registry.address,
      value: toNano("0.1"),
      body: queryBody,
    });
    const reply = findOutboundReply(r.transactions, registry, intruder);
    expect(reply).toBeTruthy();
    const body = reply!.body.beginParse();
    expect(body.loadUint(32)).toBe(REGISTRY_OP_QUERY_REPLY);
    body.loadUintBig(64); // query_id
    body.loadUintBig(64); // app_id
    body.loadUintBig(32); // claim_type
    expect(body.loadUint(1)).toBe(0);
  });
});
