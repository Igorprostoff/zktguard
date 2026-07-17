import { expect } from "chai";
import * as path from "path";
import * as crypto from "crypto";
// @ts-expect-error circom_tester has no published types
import * as circomTester from "circom_tester";
import { bytesToHex, hexToBytes } from "./lib/chacha20_ref";

const wasmTester = (circomTester as any).wasm;

/*
 * Task B4 acceptance tests: ChaCha20Poly1305Decrypt against the RFC
 * 8439 §2.8.2 vector plus roundtrips generated with Node's
 * OpenSSL-backed chacha20-poly1305 (an independent implementation of
 * the same RFC). Tag mismatch must fail witness generation.
 */

// RFC 8439 §2.8.2 inputs
const RFC_KEY =
  "808182838485868788898a8b8c8d8e8f909192939495969798999a9b9c9d9e9f";
const RFC_NONCE = "070000004041424344454647";
const RFC_AAD = "50515253c0c1c2c3c4c5c6c7";
const RFC_PT =
  "Ladies and Gentlemen of the class of '99: If I could offer you " +
  "only one tip for the future, sunscreen would be it.";

const MAX_CT = 128;
const MAX_AAD = 16;

function seal(
  key: Uint8Array,
  nonce: Uint8Array,
  aad: Uint8Array,
  pt: Uint8Array,
) {
  const cipher = crypto.createCipheriv(
    "chacha20-poly1305",
    key,
    nonce,
    { authTagLength: 16 },
  );
  cipher.setAAD(aad, { plaintextLength: pt.length });
  const ct = Buffer.concat([cipher.update(pt), cipher.final()]);
  return { ct: new Uint8Array(ct), tag: new Uint8Array(cipher.getAuthTag()) };
}

function circuitInput(
  key: Uint8Array,
  nonce: Uint8Array,
  aad: Uint8Array,
  ct: Uint8Array,
  tag: Uint8Array,
) {
  const ctPad = new Uint8Array(MAX_CT);
  ctPad.set(ct);
  const aadPad = new Uint8Array(MAX_AAD);
  aadPad.set(aad);
  return {
    key: Array.from(key),
    nonce: Array.from(nonce),
    ciphertext: Array.from(ctPad),
    ciphertextLength: ct.length,
    aad: Array.from(aadPad),
    aadLength: aad.length,
    tag: Array.from(tag),
  };
}

function expectedPlaintext(pt: Uint8Array): number[] {
  const out = new Uint8Array(MAX_CT);
  out.set(pt);
  return Array.from(out);
}

describe("ChaCha20Poly1305Decrypt (Circom circuit, 128/16)", function () {
  this.timeout(600000);

  let circuit: any;

  before(async function () {
    circuit = await wasmTester(
      path.join(__dirname, "circuits", "chacha20poly1305_128_16.circom"),
      {
        include: path.join(__dirname, "..", "node_modules"),
        prime: "bls12381",
      },
    );
  });

  async function checkRoundtrip(
    key: Uint8Array,
    nonce: Uint8Array,
    aad: Uint8Array,
    pt: Uint8Array,
  ) {
    const { ct, tag } = seal(key, nonce, aad, pt);
    const w = await circuit.calculateWitness(
      circuitInput(key, nonce, aad, ct, tag),
      true,
    );
    await circuit.assertOut(w, { plaintext: expectedPlaintext(pt) });
    return { ct, tag };
  }

  it("RFC 8439 §2.8.2: decrypts the sunscreen vector", async function () {
    const key = hexToBytes(RFC_KEY);
    const nonce = hexToBytes(RFC_NONCE);
    const aad = hexToBytes(RFC_AAD);
    const pt = new TextEncoder().encode(RFC_PT);
    const { tag } = await checkRoundtrip(key, nonce, aad, pt);
    // RFC 8439 §2.8.2 lists this tag; OpenSSL must agree.
    expect(bytesToHex(tag)).to.equal("1ae10b594f09e26a7e902ecbd0600691");
  });

  it("roundtrip with random key/nonce/aad (77-byte plaintext)", async function () {
    await checkRoundtrip(
      crypto.randomBytes(32),
      crypto.randomBytes(12),
      crypto.randomBytes(12),
      crypto.randomBytes(77),
    );
  });

  it("empty AAD", async function () {
    await checkRoundtrip(
      crypto.randomBytes(32),
      crypto.randomBytes(12),
      new Uint8Array(0),
      crypto.randomBytes(50),
    );
  });

  it("empty plaintext (tag over AAD only)", async function () {
    await checkRoundtrip(
      crypto.randomBytes(32),
      crypto.randomBytes(12),
      crypto.randomBytes(16),
      new Uint8Array(0),
    );
  });

  it("1-byte plaintext (partial block edge)", async function () {
    await checkRoundtrip(
      crypto.randomBytes(32),
      crypto.randomBytes(12),
      crypto.randomBytes(5),
      crypto.randomBytes(1),
    );
  });

  it("garbage ciphertext bytes beyond ciphertextLength are ignored", async function () {
    const key = crypto.randomBytes(32);
    const nonce = crypto.randomBytes(12);
    const aad = crypto.randomBytes(8);
    const pt = crypto.randomBytes(40);
    const { ct, tag } = seal(key, nonce, aad, pt);
    const input = circuitInput(key, nonce, aad, ct, tag) as any;
    for (let i = ct.length; i < MAX_CT; i++) {
      input.ciphertext[i] = 0xab;
    }
    const w = await circuit.calculateWitness(input, true);
    await circuit.assertOut(w, { plaintext: expectedPlaintext(pt) });
  });

  it("tag mismatch fails witness generation", async function () {
    const key = crypto.randomBytes(32);
    const nonce = crypto.randomBytes(12);
    const aad = crypto.randomBytes(12);
    const pt = crypto.randomBytes(64);
    const { ct, tag } = seal(key, nonce, aad, pt);
    tag[0] ^= 0x01;
    try {
      await circuit.calculateWitness(
        circuitInput(key, nonce, aad, ct, tag),
        true,
      );
      expect.fail("witness generation should have thrown");
    } catch (err: any) {
      expect(String(err.message ?? err)).to.not.contain("should have thrown");
    }
  });

  it("tampered ciphertext fails witness generation", async function () {
    const key = crypto.randomBytes(32);
    const nonce = crypto.randomBytes(12);
    const aad = crypto.randomBytes(12);
    const pt = crypto.randomBytes(64);
    const { ct, tag } = seal(key, nonce, aad, pt);
    ct[10] ^= 0x80;
    try {
      await circuit.calculateWitness(
        circuitInput(key, nonce, aad, ct, tag),
        true,
      );
      expect.fail("witness generation should have thrown");
    } catch (err: any) {
      expect(String(err.message ?? err)).to.not.contain("should have thrown");
    }
  });
});
