import { Address } from "@ton/core";
import {
  ZktGuardClient,
  PLACEHOLDER_VK,
  craftSyntheticProof,
  derivePlaceholderNullifier,
  buildVerifierMessageBody,
  packNonce,
  OP_CODES,
} from "../src";

const FAKE_VERIFIER_ADDR =
  "EQA__verifier__placeholder_address_for_tests_0000000000000000";

const VALID_ADDR =
  "EQDk2VTvn04SUKJrW7rXahzdF8_Qi6utb0wj43InCu9vdjrR";

describe("ZktGuardClient", () => {
  it("init validates VK shape", () => {
    expect(() =>
      ZktGuardClient.init({
        network: "testnet",
        verifierAddress: VALID_ADDR,
        attestorUrl: "http://127.0.0.1:7677",
        vk: { ...PLACEHOLDER_VK, ic: [1n, 2n] }, // too short
      }),
    ).toThrow(/vk.ic must have exactly 9/);
  });

  it("init resolves a string address", () => {
    const c = ZktGuardClient.init({
      network: "testnet",
      verifierAddress: VALID_ADDR,
      attestorUrl: "http://127.0.0.1:7677",
    });
    expect(c).toBeInstanceOf(ZktGuardClient);
  });

  it("verifyCredential refuses without a TonClient", async () => {
    const c = ZktGuardClient.init({
      network: "testnet",
      verifierAddress: VALID_ADDR,
      attestorUrl: "http://127.0.0.1:7677",
    });
    await expect(c.verifyCredential(1n)).rejects.toThrow(/tonClient/);
  });

  it("getCredential returns null in v0 stub", async () => {
    const c = ZktGuardClient.init({
      network: "testnet",
      verifierAddress: VALID_ADDR,
      attestorUrl: "http://127.0.0.1:7677",
    });
    const out = await c.getCredential(Address.parse(VALID_ADDR), "account_age");
    expect(out).toBeNull();
  });

  it("requireClaim composes attestor + prover paths against the placeholder VK", async () => {
    // Stub global fetch for the attestor /pubkey hit.
    const origFetch = global.fetch;
    global.fetch = (async () => ({
      ok: true,
      status: 200,
      async json() {
        return { x: "5", y: "7" };
      },
    })) as any;

    try {
      const c = ZktGuardClient.init({
        network: "testnet",
        verifierAddress: VALID_ADDR,
        attestorUrl: "http://127.0.0.1:7677",
      });
      const cred = await c.requireClaim("account_age", {
        appId: 1n,
        claimType: 1n,
        thresholdMonths: 6n,
        userSecret: 0xc0ffeen,
        expirationSec: 2_000_000_000n,
      });
      expect(cred.proof.aHex).toHaveLength(96);
      expect(cred.proof.bHex).toHaveLength(192);
      expect(cred.proof.cHex).toHaveLength(96);
      expect(cred.nullifier).toBeGreaterThan(0n);
    } finally {
      global.fetch = origFetch;
    }
  });
});

describe("packNonce", () => {
  it("packs chain_id into the high 32 bits", () => {
    const v = packNonce(2n, 0xdeadbeefn);
    expect(v >> 224n).toBe(2n);
    expect(v & ((1n << 224n) - 1n)).toBe(0xdeadbeefn);
  });

  it("rejects out-of-range chain_id", () => {
    expect(() => packNonce(1n << 33n, 0n)).toThrow();
  });
});

describe("craftSyntheticProof", () => {
  it("emits 48/96/48-byte compressed points", () => {
    const pi = [1n, 2n, 3n, 4n, 5n, 6n, 7n, 8n];
    const out = craftSyntheticProof(PLACEHOLDER_VK, pi);
    expect(out.aHex).toHaveLength(96);
    expect(out.bHex).toHaveLength(192);
    expect(out.cHex).toHaveLength(96);
  });

  it("rejects wrong public_input arity", () => {
    expect(() => craftSyntheticProof(PLACEHOLDER_VK, [1n, 2n])).toThrow();
  });
});

describe("derivePlaceholderNullifier", () => {
  it("is deterministic", () => {
    expect(derivePlaceholderNullifier(1n, 2n, 3n)).toEqual(
      derivePlaceholderNullifier(1n, 2n, 3n),
    );
  });

  it("differs across app_ids", () => {
    expect(derivePlaceholderNullifier(1n, 2n, 3n)).not.toEqual(
      derivePlaceholderNullifier(1n, 3n, 3n),
    );
  });

  it("differs across user_secrets", () => {
    expect(derivePlaceholderNullifier(1n, 2n, 3n)).not.toEqual(
      derivePlaceholderNullifier(2n, 2n, 3n),
    );
  });
});

describe("buildVerifierMessageBody", () => {
  it("builds the 4-ref body the FunC verifier expects", () => {
    const pi = [1n, 2n, 3n, 4n, 5n, 6n, 7n, 8n];
    const proof = craftSyntheticProof(PLACEHOLDER_VK, pi);
    const cell = buildVerifierMessageBody({
      queryId: 42n,
      proof,
      publicInputs: pi,
    });
    expect(cell.bits.length).toBe(96); // op(32) + query_id(64)
    expect(cell.refs.length).toBe(4);
  });
});

describe("OP_CODES", () => {
  it("matches the FunC constant", () => {
    expect(OP_CODES.verifyClaim).toBe(0x76657266);
  });
});
