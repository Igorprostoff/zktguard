import { execSync } from "node:child_process";
import * as path from "node:path";

import { expect } from "chai";
// @ts-expect-error circom_tester has no published types
import { wasm as wasmTester } from "circom_tester";
// @ts-expect-error circomlibjs has no published types
import { buildPoseidon } from "circomlibjs";

function circomAvailable(): boolean {
  try {
    execSync("circom --version", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

describe("NullifierPoseidon", function () {
  before(function () {
    if (!circomAvailable()) {
      // eslint-disable-next-line no-console
      console.warn(
        "[skip] circom v2 not on PATH — see scripts/build.sh for install steps",
      );
      this.skip();
    }
  });

  it("computes nullifier := Poseidon(user_secret, app_id, claim_type)", async function () {
    this.timeout(60000);

    // Synthesise a one-shot top-level wrapper around the sub-template so
    // circom_tester can stand it up without needing a full ceremony.
    const wrapperSource = `
      pragma circom 2.1.6;
      include "${path
        .resolve(
          __dirname,
          "../account_age/templates/nullifier.circom",
        )
        .replace(/\\/g, "/")}";
      template Main() {
        signal input user_secret;
        signal input app_id;
        signal input claim_type;
        signal output out;
        component n = NullifierPoseidon();
        n.user_secret <== user_secret;
        n.app_id <== app_id;
        n.claim_type <== claim_type;
        out <== n.out;
      }
      component main = Main();
    `;
    const tmpPath = path.join(__dirname, ".__nullifier_wrapper.circom");
    require("node:fs").writeFileSync(tmpPath, wrapperSource);

    try {
      const circuit = await wasmTester(tmpPath, {
        include: [path.resolve(__dirname, "..", "node_modules")],
      });

      const user_secret = 12345n;
      const app_id = 42n;
      const claim_type = 1n;

      const witness = await circuit.calculateWitness(
        { user_secret, app_id, claim_type },
        true,
      );
      await circuit.checkConstraints(witness);

      const poseidon = await buildPoseidon();
      const expected = poseidon.F.toObject(
        poseidon([user_secret, app_id, claim_type]),
      );

      // witness[0] is constant 1; witness[1] is the first output `out`.
      expect(witness[1].toString()).to.equal(expected.toString());
    } finally {
      require("node:fs").unlinkSync(tmpPath);
    }
  });

  it("produces distinct nullifiers for the same user across app_ids", async function () {
    this.timeout(60000);

    const poseidon = await buildPoseidon();
    const user_secret = 999n;
    const claim_type = 1n;

    const n1 = poseidon.F.toObject(poseidon([user_secret, 1n, claim_type]));
    const n2 = poseidon.F.toObject(poseidon([user_secret, 2n, claim_type]));
    expect(n1.toString()).to.not.equal(n2.toString());
  });
});
