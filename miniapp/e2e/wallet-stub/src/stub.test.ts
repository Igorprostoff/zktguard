/**
 * Unit tests for the wallet stub. These run under Vitest with no
 * network access (TonClient is stubbed). The Playwright suite
 * covers the network-touching paths.
 */
import { describe, it, expect, vi } from "vitest";
import { Address, beginCell } from "@ton/core";
import { mnemonicToPrivateKey } from "@ton/crypto";
import { WalletContractV5R1 } from "@ton/ton";

import { WalletStub } from "./index";

// Deterministic test mnemonic — 24 BIP-39 words. NOT a real wallet;
// the public key is well-known to anyone who reads the test source.
const TEST_MNEMONIC =
  "test test test test test test test test test test test test " +
  "test test test test test test test test test test test junk";

describe("WalletStub", () => {
  it("connect returns valid wallet info with a v5R1 address", async () => {
    const stub = await WalletStub.create({
      mnemonic: TEST_MNEMONIC,
      endpoint: "https://localhost.invalid/api/v2/jsonRPC",
    });
    const info = stub.walletInfo();
    expect(info.address).toMatch(/^kQ[A-Za-z0-9_-]+$/); // testnet bounceable
    expect(info.chain).toBe("-3");
    expect(info.publicKey).toMatch(/^[0-9a-f]{64}$/);

    // Cross-check: the same mnemonic + v5R1 derivation produces the
    // same address outside the stub.
    const words = TEST_MNEMONIC.split(/\s+/);
    const kp = await mnemonicToPrivateKey(words);
    const expectedAddr = WalletContractV5R1.create({
      workchain: 0,
      publicKey: kp.publicKey,
    }).address.toString({ testOnly: true, bounceable: true });
    expect(info.address).toBe(expectedAddr);
  });

  it("sendTransaction routes through the throttle wrapper and TonClient", async () => {
    const stub = await WalletStub.create({
      mnemonic: TEST_MNEMONIC,
      endpoint: "https://localhost.invalid/api/v2/jsonRPC",
    });

    // Spy on the wallet contract's transfer + seqno paths.
    const sendSpy = vi.fn().mockResolvedValue(undefined);
    const seqnoSpy = vi.fn().mockResolvedValue(0);
    const openSpy = vi.spyOn((stub as any).client, "open").mockReturnValue({
      sendTransfer: sendSpy,
      getSeqno: seqnoSpy,
    });

    const dummyAddress = Address.parse(
      "kQC3iKBTNrafHaoTFN6UwrR4LRM_-GZTosffllkhwQmtqg_h",
    );
    const dummyBody = beginCell().storeUint(0x76657266, 32).endCell();
    const result = await stub.sendTransaction({
      validUntil: Math.floor(Date.now() / 1000) + 600,
      messages: [
        {
          address: dummyAddress.toString(),
          amount: "100000000",
          payload: dummyBody.toBoc().toString("base64"),
        },
      ],
    });

    expect(openSpy).toHaveBeenCalled();
    expect(seqnoSpy).toHaveBeenCalled();
    expect(sendSpy).toHaveBeenCalledTimes(1);
    expect(result.boc).toBeTypeOf("string");
  });

  it("sendTransaction respects the rate-limit barrier on consecutive calls", async () => {
    // The throttle wrapper sleeps `RATE_DELAY_MS` between calls. We
    // assert that two consecutive sendTransaction calls are spaced by
    // at least the configured delay. To keep the test fast we lower
    // the delay via env override.
    process.env.RATE_DELAY_MS = "100";
    const stub = await WalletStub.create({
      mnemonic: TEST_MNEMONIC,
      endpoint: "https://localhost.invalid/api/v2/jsonRPC",
    });
    const sendSpy = vi.fn().mockResolvedValue(undefined);
    const seqnoSpy = vi.fn().mockResolvedValue(0);
    vi.spyOn((stub as any).client, "open").mockReturnValue({
      sendTransfer: sendSpy,
      getSeqno: seqnoSpy,
    });

    const req = {
      validUntil: Math.floor(Date.now() / 1000) + 600,
      messages: [
        {
          address: "kQC3iKBTNrafHaoTFN6UwrR4LRM_-GZTosffllkhwQmtqg_h",
          amount: "1",
        },
      ],
    };
    const t0 = Date.now();
    await stub.sendTransaction(req);
    await stub.sendTransaction(req);
    const elapsed = Date.now() - t0;
    // Two sendTransaction calls = at least 2 throttled inner calls;
    // each pays a RATE_DELAY_MS pause. With 100ms delay and four
    // calls (seqno + transfer x 2), elapsed >= ~400ms.
    expect(elapsed).toBeGreaterThanOrEqual(300);

    delete process.env.RATE_DELAY_MS;
  });
});
