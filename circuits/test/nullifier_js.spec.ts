import { expect } from "chai";
// @ts-expect-error circomlibjs has no published types
import { buildPoseidon } from "circomlibjs";

/*
 * JS-only properties of the nullifier construction. These do not need
 * the circom compiler — they exercise the same Poseidon hash the
 * circuit uses, asserted against the canonical circomlibjs reference.
 */

describe("nullifier (JS reference)", function () {
  let poseidon: any;

  before(async function () {
    this.timeout(20000);
    poseidon = await buildPoseidon();
  });

  function n(user: bigint, app: bigint, claim: bigint): string {
    return poseidon.F.toObject(poseidon([user, app, claim])).toString();
  }

  it("is deterministic", function () {
    const a = n(42n, 1n, 1n);
    const b = n(42n, 1n, 1n);
    expect(a).to.equal(b);
  });

  it("is unlinkable across app_ids for the same user", function () {
    const a = n(42n, 1n, 1n);
    const b = n(42n, 2n, 1n);
    expect(a).to.not.equal(b);
  });

  it("is unlinkable across claim_types for the same user-app pair", function () {
    const a = n(42n, 1n, 1n);
    const b = n(42n, 1n, 2n);
    expect(a).to.not.equal(b);
  });

  it("is unlinkable across users for the same app-claim pair", function () {
    const a = n(42n, 1n, 1n);
    const b = n(43n, 1n, 1n);
    expect(a).to.not.equal(b);
  });
});
