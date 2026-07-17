import { expect } from "chai";
import * as path from "path";
// @ts-expect-error circom_tester has no published types
import * as circomTester from "circom_tester";
import {
  bytesToHex,
  bytesToWordsLE,
  chachaEncrypt,
  hexToBytes,
} from "./lib/chacha20_ref";

const wasmTester = (circomTester as any).wasm;

/*
 * Task B2 acceptance tests: the ChaCha20 Circom template against the
 * RFC 8439 vectors. Six vectors total — §2.3.2, A.1 #1–#5 (keystream,
 * asserted by encrypting an all-zero block) and the §2.4.2 two-block
 * "sunscreen" encryption.
 *
 * Each vector is asserted twice: once against the TS reference
 * implementation (fast, catches vector typos) and once against the
 * compiled circuit's witness.
 */

const KEY_SEQ =
  "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";
const KEY_ZERO = "00".repeat(32);
const NONCE_ZERO = "00".repeat(12);

interface Vector {
  name: string;
  key: string;
  nonce: string;
  counter: number;
  plaintext: Uint8Array;
  ciphertext: string; // RFC-listed bytes
}

const ONE_BLOCK_VECTORS: Vector[] = [
  {
    name: "RFC 8439 §2.3.2 block function",
    key: KEY_SEQ,
    nonce: "000000090000004a00000000",
    counter: 1,
    plaintext: new Uint8Array(64),
    ciphertext:
      "10f1e7e4d13b5915500fdd1fa32071c4c7d1f4c733c068030422aa9ac3d46c4e" +
      "d2826446079faa0914c2d705d98b02a2b5129cd1de164eb9cbd083e8a2503c4e",
  },
  {
    name: "RFC 8439 A.1 #1 (zero key, counter 0)",
    key: KEY_ZERO,
    nonce: NONCE_ZERO,
    counter: 0,
    plaintext: new Uint8Array(64),
    ciphertext:
      "76b8e0ada0f13d90405d6ae55386bd28bdd219b8a08ded1aa836efcc8b770dc7" +
      "da41597c5157488d7724e03fb8d84a376a43b8f41518a11cc387b669b2ee6586",
  },
  {
    name: "RFC 8439 A.1 #2 (zero key, counter 1)",
    key: KEY_ZERO,
    nonce: NONCE_ZERO,
    counter: 1,
    plaintext: new Uint8Array(64),
    ciphertext:
      "9f07e7be5551387a98ba977c732d080dcb0f29a048e3656912c6533e32ee7aed" +
      "29b721769ce64e43d57133b074d839d531ed1f28510afb45ace10a1f4b794d6f",
  },
  {
    name: "RFC 8439 A.1 #3 (key ...01, counter 1)",
    key: "00".repeat(31) + "01",
    nonce: NONCE_ZERO,
    counter: 1,
    plaintext: new Uint8Array(64),
    ciphertext:
      "3aeb5224ecf849929b9d828db1ced4dd832025e8018b8160b82284f3c949aa5a" +
      "8eca00bbb4a73bdad192b5c42f73f2fd4e273644c8b36125a64addeb006c13a0",
  },
  {
    name: "RFC 8439 A.1 #4 (key 00ff..., counter 2)",
    key: "00ff" + "00".repeat(30),
    nonce: NONCE_ZERO,
    counter: 2,
    plaintext: new Uint8Array(64),
    ciphertext:
      "72d54dfbf12ec44b362692df94137f328fea8da73990265ec1bbbea1ae9af0ca" +
      "13b25aa26cb4a648cb9b9d1be65b2c0924a66c54d545ec1b7374f4872e99f096",
  },
  {
    name: "RFC 8439 A.1 #5 (nonce ...02, counter 0)",
    key: KEY_ZERO,
    nonce: "00".repeat(11) + "02",
    counter: 0,
    plaintext: new Uint8Array(64),
    ciphertext:
      "c2c64d378cd536374ae204b9ef933fcd1a8b2288b3dfa49672ab765b54ee27c7" +
      "8a970e0e955c14f3a88e741b97c286f75f8fc299e8148362fa198a39531bed6d",
  },
];

const SUNSCREEN: Vector = {
  name: "RFC 8439 §2.4.2 two-block encryption",
  key: KEY_SEQ,
  nonce: "000000000000004a00000000",
  counter: 1,
  plaintext: new TextEncoder().encode(
    "Ladies and Gentlemen of the class of '99: If I could offer you " +
      "only one tip for the future, sunscreen would be it.",
  ),
  ciphertext:
    "6e2e359a2568f98041ba0728dd0d6981e97e7aec1d4360c20a27afccfd9fae0b" +
    "f91b65c5524733ab8f593dabcd62b3571639d624e65152ab8f530c359f0861d8" +
    "07ca0dbf500d6a6156a38e088a22b65e52bc514d16ccf806818ce91ab7793736" +
    "5af90bbf74a35be6b40b8eedf2785e42874d",
};

function pad(bytes: Uint8Array, len: number): Uint8Array {
  const out = new Uint8Array(len);
  out.set(bytes);
  return out;
}

function circuitInput(v: Vector, numBlocks: number) {
  return {
    key: Array.from(bytesToWordsLE(hexToBytes(v.key))),
    nonce: Array.from(bytesToWordsLE(hexToBytes(v.nonce))),
    counter: v.counter,
    plaintext: Array.from(bytesToWordsLE(pad(v.plaintext, numBlocks * 64))),
  };
}

function expectedWords(v: Vector, numBlocks: number): number[] {
  const ct = chachaEncrypt(
    hexToBytes(v.key),
    hexToBytes(v.nonce),
    v.counter,
    pad(v.plaintext, numBlocks * 64),
  );
  return Array.from(bytesToWordsLE(ct));
}

describe("ChaCha20 (TS reference vs RFC 8439)", function () {
  for (const v of [...ONE_BLOCK_VECTORS, SUNSCREEN]) {
    it(v.name, function () {
      const ct = chachaEncrypt(
        hexToBytes(v.key),
        hexToBytes(v.nonce),
        v.counter,
        v.plaintext,
      );
      expect(bytesToHex(ct)).to.equal(v.ciphertext);
    });
  }
});

describe("ChaCha20 (Circom circuit)", function () {
  this.timeout(600000);

  let b1: any;
  let b2: any;

  before(async function () {
    const opts = {
      include: path.join(__dirname, "..", "node_modules"),
      prime: "bls12381",
    };
    b1 = await wasmTester(
      path.join(__dirname, "circuits", "chacha20_b1.circom"),
      opts,
    );
    b2 = await wasmTester(
      path.join(__dirname, "circuits", "chacha20_b2.circom"),
      opts,
    );
  });

  for (const v of ONE_BLOCK_VECTORS) {
    it(v.name, async function () {
      const w = await b1.calculateWitness(circuitInput(v, 1), true);
      await b1.assertOut(w, { ciphertext: expectedWords(v, 1) });
    });
  }

  it(SUNSCREEN.name, async function () {
    const w = await b2.calculateWitness(circuitInput(SUNSCREEN, 2), true);
    const words = expectedWords(SUNSCREEN, 2);
    await b2.assertOut(w, { ciphertext: words });
    // The unpadded prefix must equal the RFC-listed ciphertext bytes.
    const refBytes = hexToBytes(SUNSCREEN.ciphertext);
    const circBytes = chachaEncrypt(
      hexToBytes(SUNSCREEN.key),
      hexToBytes(SUNSCREEN.nonce),
      SUNSCREEN.counter,
      pad(SUNSCREEN.plaintext, 128),
    ).slice(0, refBytes.length);
    expect(bytesToHex(circBytes)).to.equal(bytesToHex(refBytes));
  });

  it("rejects an out-of-range plaintext word", async function () {
    const input = circuitInput(ONE_BLOCK_VECTORS[0], 1) as any;
    input.plaintext[0] = "4294967296"; // 2^32
    try {
      await b1.calculateWitness(input, true);
      expect.fail("witness generation should have thrown");
    } catch (err: any) {
      expect(String(err.message ?? err)).to.not.contain(
        "should have thrown",
      );
    }
  });
});
