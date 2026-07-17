import { expect } from "chai";
import * as path from "path";
import * as crypto from "crypto";
// @ts-expect-error circom_tester has no published types
import * as circomTester from "circom_tester";

const wasmTester = (circomTester as any).wasm;

/*
 * Task B5 acceptance tests: the full account_age circuit over a
 * synthetic attested transcript. The transcript is sealed with Node's
 * OpenSSL chacha20-poly1305, so witness generation exercises the real
 * AEAD path end-to-end: decrypt → marker scan → digit decode →
 * threshold → nullifier.
 */

const MAX_CT = 512;
const MAX_AAD = 16;

const NOW = 1750000000; // fixed "current time" for determinism
const OLD_TS = 1231006505; // 2009 — comfortably old
const THRESHOLD_MONTHS = 12;

interface Sealed {
  key: Uint8Array;
  nonce: Uint8Array;
  aad: Uint8Array;
  ct: Uint8Array;
  tag: Uint8Array;
  offset: number;
}

function sealTranscript(createdAt: number | string, aadLen = 5): Sealed {
  const json = `{"id":987654321,"created_at":${createdAt},"username":"alice"}`;
  const pt = new TextEncoder().encode(json);
  const offset = json.indexOf('"created_at"');
  const key = crypto.randomBytes(32);
  const nonce = crypto.randomBytes(12);
  const aad = crypto.randomBytes(aadLen);
  const cipher = crypto.createCipheriv("chacha20-poly1305", key, nonce, {
    authTagLength: 16,
  });
  cipher.setAAD(aad, { plaintextLength: pt.length });
  const ct = Buffer.concat([cipher.update(pt), cipher.final()]);
  return {
    key,
    nonce,
    aad,
    ct: new Uint8Array(ct),
    tag: new Uint8Array(cipher.getAuthTag()),
    offset,
  };
}

function witnessInput(s: Sealed, overrides: Record<string, unknown> = {}) {
  const ctPad = new Uint8Array(MAX_CT);
  ctPad.set(s.ct);
  const aadPad = new Uint8Array(MAX_AAD);
  aadPad.set(s.aad);
  return {
    nonce: ((123n << 224n) | 42n).toString(),
    app_id: "1",
    expiration: String(NOW + 3600),
    claim_type: "1",
    attestor_pubkey_x: "11",
    attestor_pubkey_y: "12",
    threshold_months: String(THRESHOLD_MONTHS),
    user_secret: "271828182845904523536",
    current_time: String(NOW),
    timestamp_offset: String(s.offset),
    tls_key: Array.from(s.key),
    tls_nonce: Array.from(s.nonce),
    ciphertext: Array.from(ctPad),
    ciphertext_length: s.ct.length,
    aad: Array.from(aadPad),
    aad_length: s.aad.length,
    tag: Array.from(s.tag),
    ...overrides,
  };
}

describe("account_age (full circuit, Phase B)", function () {
  this.timeout(900000);

  let circuit: any;

  before(async function () {
    // mocha runs from the circuits/ workspace root
    circuit = await wasmTester(
      path.join(process.cwd(), "account_age", "circuit.circom"),
      {
        include: path.join(process.cwd(), "node_modules"),
        prime: "bls12381",
      },
    );
  });

  async function nullifierOf(input: any): Promise<bigint> {
    const w = await circuit.calculateWitness(input, true);
    // Witness layout: w[0] = 1, w[1] = first public signal = nullifier.
    return BigInt(w[1]);
  }

  async function expectReject(input: any) {
    try {
      await circuit.calculateWitness(input, true);
      expect.fail("witness generation should have thrown");
    } catch (err: any) {
      expect(String(err.message ?? err)).to.not.contain("should have thrown");
    }
  }

  it("accepts an old-enough attested transcript", async function () {
    const s = sealTranscript(OLD_TS);
    const n = await nullifierOf(witnessInput(s));
    expect(n).to.not.equal(0n);
  });

  it("nullifier is deterministic and app-scoped", async function () {
    const a = await nullifierOf(witnessInput(sealTranscript(OLD_TS)));
    const b = await nullifierOf(witnessInput(sealTranscript(OLD_TS)));
    expect(a).to.equal(b); // same user_secret/app/claim, fresh session keys
    const c = await nullifierOf(
      witnessInput(sealTranscript(OLD_TS), { app_id: "2" }),
    );
    expect(c).to.not.equal(a);
  });

  it("rejects an account younger than the threshold", async function () {
    const young = NOW - 30 * 24 * 3600; // 1 month old, threshold 12
    const s = sealTranscript(young);
    await expectReject(witnessInput(s));
  });

  it("rejects a tampered tag", async function () {
    const s = sealTranscript(OLD_TS);
    s.tag[3] ^= 0x40;
    await expectReject(witnessInput(s));
  });

  it("rejects a wrong timestamp offset", async function () {
    const s = sealTranscript(OLD_TS);
    await expectReject(
      witnessInput(s, { timestamp_offset: String(s.offset + 1) }),
    );
  });

  it("rejects a 9-digit created_at (documented 10-digit assumption)", async function () {
    const s = sealTranscript(999999999);
    await expectReject(witnessInput(s));
  });

  it("rejects a forged plaintext marker outside the ciphertext", async function () {
    // Valid seal, but the prover claims the marker sits in the
    // zero-masked padding region.
    const s = sealTranscript(OLD_TS);
    await expectReject(witnessInput(s, { timestamp_offset: String(s.ct.length + 4) }));
  });
});
