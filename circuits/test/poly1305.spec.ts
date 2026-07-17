import { expect } from "chai";
import * as path from "path";
import * as crypto from "crypto";
// @ts-expect-error circom_tester has no published types
import * as circomTester from "circom_tester";
import { bytesToHex, chachaEncrypt, hexToBytes } from "./lib/chacha20_ref";
import { aeadMacData, poly1305 } from "./lib/poly1305_ref";

const wasmTester = (circomTester as any).wasm;

/*
 * Task B3 acceptance tests. The RFC 8439 §2.5.2 vector is asserted
 * byte-for-byte; the TS reference is additionally validated against
 * Node's OpenSSL chacha20-poly1305 (whose auth tag is Poly1305 over
 * the §2.8 MAC data) so the remaining circuit vectors don't rest on
 * hand-copied constants.
 */

// RFC 8439 §2.5.2 (also quoted in paper/design/chacha20-circuit.md)
const RFC_KEY =
  "85d6be7857556d337f4452fe42d506a80103808afb0db2fd4abff6af4149f51b";
const RFC_MSG = "Cryptographic Forum Research Group";
const RFC_TAG = "a8061dc1305136c6c22b8baf0c0127a9";

function circuitInput(key: Uint8Array, msg: Uint8Array, max: number) {
  const padded = new Uint8Array(max);
  padded.set(msg);
  return {
    key: Array.from(key),
    message: Array.from(padded),
    messageLength: msg.length,
  };
}

describe("Poly1305 (TS reference)", function () {
  it("matches the RFC 8439 §2.5.2 vector", function () {
    const tag = poly1305(
      hexToBytes(RFC_KEY),
      new TextEncoder().encode(RFC_MSG),
    );
    expect(bytesToHex(tag)).to.equal(RFC_TAG);
  });

  it("agrees with OpenSSL chacha20-poly1305 on the full AEAD tag", function () {
    for (let trial = 0; trial < 8; trial++) {
      const key = crypto.randomBytes(32);
      const nonce = crypto.randomBytes(12);
      const aad = crypto.randomBytes(trial * 3);
      const pt = crypto.randomBytes(1 + trial * 17);

      const cipher = crypto.createCipheriv(
        "chacha20-poly1305",
        key,
        nonce,
        { authTagLength: 16 },
      );
      cipher.setAAD(aad, { plaintextLength: pt.length });
      const ct = Buffer.concat([cipher.update(pt), cipher.final()]);
      const expected = cipher.getAuthTag();

      // §2.8: one-time key = first 32 bytes of the counter-0 block.
      const otk = chachaEncrypt(key, nonce, 0, new Uint8Array(64)).slice(
        0,
        32,
      );
      const tag = poly1305(otk, aeadMacData(aad, ct));
      expect(bytesToHex(tag)).to.equal(expected.toString("hex"));
    }
  });
});

describe("Poly1305 (Circom circuit, maxMessageBytes = 64)", function () {
  this.timeout(600000);

  let circuit: any;

  before(async function () {
    circuit = await wasmTester(
      path.join(__dirname, "circuits", "poly1305_64.circom"),
      {
        include: path.join(__dirname, "..", "node_modules"),
        prime: "bls12381",
      },
    );
  });

  async function check(key: Uint8Array, msg: Uint8Array) {
    const w = await circuit.calculateWitness(circuitInput(key, msg, 64), true);
    await circuit.assertOut(w, { tag: Array.from(poly1305(key, msg)) });
  }

  it("RFC 8439 §2.5.2 (34-byte message)", async function () {
    const key = hexToBytes(RFC_KEY);
    const msg = new TextEncoder().encode(RFC_MSG);
    const w = await circuit.calculateWitness(circuitInput(key, msg, 64), true);
    await circuit.assertOut(w, { tag: Array.from(hexToBytes(RFC_TAG)) });
  });

  it("RFC 8439 A.3 #1: zero key, 64-byte zero message → zero tag", async function () {
    const key = new Uint8Array(32);
    const msg = new Uint8Array(64);
    const w = await circuit.calculateWitness(circuitInput(key, msg, 64), true);
    await circuit.assertOut(w, { tag: Array(16).fill(0) });
  });

  it("r = 0 → tag equals s (RFC 8439 A.3 #2 structure)", async function () {
    const key = new Uint8Array(32);
    const s = hexToBytes("36e5f6b5c5e06070f0efca96227a863e");
    key.set(s, 16);
    const msg = new TextEncoder().encode(
      "Any submission to the IETF intended by the Contributor",
    );
    const w = await circuit.calculateWitness(circuitInput(key, msg, 64), true);
    await circuit.assertOut(w, { tag: Array.from(s) });
  });

  it("empty message → tag = s mod 2^128", async function () {
    const key = crypto.randomBytes(32);
    await check(key, new Uint8Array(0));
  });

  it("1-byte message (minimal partial block)", async function () {
    await check(crypto.randomBytes(32), crypto.randomBytes(1));
  });

  it("15-byte message (one byte short of a block)", async function () {
    await check(crypto.randomBytes(32), crypto.randomBytes(15));
  });

  it("16-byte message (exact single block)", async function () {
    await check(crypto.randomBytes(32), crypto.randomBytes(16));
  });

  it("17-byte message (block boundary + 1)", async function () {
    await check(crypto.randomBytes(32), crypto.randomBytes(17));
  });

  it("ignores buffer bytes beyond messageLength", async function () {
    const key = crypto.randomBytes(32);
    const msg = crypto.randomBytes(20);
    const padded = new Uint8Array(64);
    padded.set(msg);
    const garbage = crypto.randomBytes(44);
    padded.set(garbage, 20);
    const w = await circuit.calculateWitness(
      {
        key: Array.from(key),
        message: Array.from(padded),
        messageLength: 20,
      },
      true,
    );
    await circuit.assertOut(w, { tag: Array.from(poly1305(key, msg)) });
  });

  it("rejects messageLength above the buffer size", async function () {
    try {
      await circuit.calculateWitness(
        {
          key: Array(32).fill(0),
          message: Array(64).fill(0),
          messageLength: 65,
        },
        true,
      );
      expect.fail("witness generation should have thrown");
    } catch (err: any) {
      expect(String(err.message ?? err)).to.not.contain("should have thrown");
    }
  });
});
