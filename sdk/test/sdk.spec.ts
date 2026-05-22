import {
  ZktGuardClient,
  buildVerifierMessageBody,
  packNonce,
  OP_CODES,
} from "../src";
import { Address } from "@ton/core";

const VALID_ADDR = "EQDk2VTvn04SUKJrW7rXahzdF8_Qi6utb0wj43InCu9vdjrR";

function baseConfig() {
  return {
    network: "testnet" as const,
    verifierAddress: VALID_ADDR,
    attestorUrl: "http://127.0.0.1:7677",
    proverUrl: "http://127.0.0.1:7679",
  };
}

describe("ZktGuardClient", () => {
  it("init rejects missing proverUrl", () => {
    expect(() =>
      ZktGuardClient.init({
        network: "testnet",
        verifierAddress: VALID_ADDR,
        attestorUrl: "http://127.0.0.1:7677",
        proverUrl: "",
      }),
    ).toThrow(/proverUrl/);
  });

  it("init resolves a string address", () => {
    const c = ZktGuardClient.init(baseConfig());
    expect(c).toBeInstanceOf(ZktGuardClient);
  });

  it("verifyCredential refuses without a TonClient", async () => {
    const c = ZktGuardClient.init(baseConfig());
    await expect(c.verifyCredential(1n)).rejects.toThrow(/tonClient/);
  });

  it("getCredential returns null in v0.2 stub (wired in Phase C)", async () => {
    const c = ZktGuardClient.init(baseConfig());
    const out = await c.getCredential(Address.parse(VALID_ADDR), "account_age");
    expect(out).toBeNull();
  });

  it("requireClaim posts the witness to the prover and returns its proof", async () => {
    const calls: string[] = [];
    const origFetch = global.fetch;
    global.fetch = (async (url: string, opts?: any) => {
      calls.push(url + (opts?.method ? `:${opts.method}` : ""));
      if (url.endsWith("/pubkey")) {
        return {
          ok: true,
          status: 200,
          async json() {
            return { x: "5", y: "7" };
          },
        };
      }
      if (url.endsWith("/prove")) {
        return {
          ok: true,
          status: 200,
          async json() {
            return {
              aHex: "A".repeat(96),
              bHex: "B".repeat(192),
              cHex: "C".repeat(96),
              publicInputs: [
                "111", "222", "1", "2000000000", "1", "5", "7", "6",
              ],
            };
          },
        };
      }
      throw new Error(`unstubbed fetch: ${url}`);
    }) as any;

    try {
      const c = ZktGuardClient.init(baseConfig());
      const cred = await c.requireClaim("account_age", {
        appId: 1n,
        claimType: 1n,
        thresholdMonths: 6n,
        userSecret: 0xc0ffeen,
        expirationSec: 2_000_000_000n,
      });
      expect(cred.nullifier).toBe(111n);
      expect(cred.proof.aHex).toHaveLength(96);
      expect(cred.proof.bHex).toHaveLength(192);
      expect(cred.proof.cHex).toHaveLength(96);
      expect(calls.some((c) => c.includes("/pubkey"))).toBe(true);
      expect(calls.some((c) => c.includes("/prove:POST"))).toBe(true);
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

describe("buildVerifierMessageBody", () => {
  it("builds the 4-ref body the FunC verifier expects", () => {
    const pi = [1n, 2n, 3n, 4n, 5n, 6n, 7n, 8n];
    const cell = buildVerifierMessageBody({
      queryId: 42n,
      proof: {
        aHex: "A".repeat(96),
        bHex: "B".repeat(192),
        cHex: "C".repeat(96),
      },
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
