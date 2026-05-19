import { execSync } from "node:child_process";
import * as path from "node:path";
import * as fs from "node:fs";

import { expect } from "chai";
// @ts-expect-error circom_tester has no published types
import { wasm as wasmTester } from "circom_tester";

function circomAvailable(): boolean {
  try {
    execSync("circom --version", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

const WRAPPER = `
  pragma circom 2.1.6;
  include "$INCLUDE$";
  template Main() {
    signal input creation_timestamp;
    signal input current_time;
    signal input threshold_months;
    component t = TimestampThreshold();
    t.creation_timestamp <== creation_timestamp;
    t.current_time <== current_time;
    t.threshold_months <== threshold_months;
  }
  component main = Main();
`;

async function build() {
  const include = path
    .resolve(
      __dirname,
      "../account_age/templates/timestamp_threshold.circom",
    )
    .replace(/\\/g, "/");
  const tmp = path.join(__dirname, ".__threshold_wrapper.circom");
  fs.writeFileSync(tmp, WRAPPER.replace("$INCLUDE$", include));
  return tmp;
}

describe("TimestampThreshold", function () {
  let wrapperPath: string;

  before(async function () {
    if (!circomAvailable()) {
      // eslint-disable-next-line no-console
      console.warn(
        "[skip] circom v2 not on PATH — see scripts/build.sh for install steps",
      );
      this.skip();
      return;
    }
    wrapperPath = await build();
  });

  after(function () {
    if (wrapperPath && fs.existsSync(wrapperPath)) {
      fs.unlinkSync(wrapperPath);
    }
  });

  it("accepts a creation_timestamp older than the threshold", async function () {
    this.timeout(60000);
    const circuit = await wasmTester(wrapperPath, {
      include: [path.resolve(__dirname, "..", "node_modules")],
    });
    const SECONDS_PER_MONTH = 2592000n;
    const current_time = 1_700_000_000n;
    const threshold_months = 6n;
    const creation_timestamp =
      current_time - threshold_months * SECONDS_PER_MONTH - 1n;
    const witness = await circuit.calculateWitness(
      { creation_timestamp, current_time, threshold_months },
      true,
    );
    await circuit.checkConstraints(witness);
  });

  it("rejects a creation_timestamp newer than the threshold", async function () {
    this.timeout(60000);
    const circuit = await wasmTester(wrapperPath, {
      include: [path.resolve(__dirname, "..", "node_modules")],
    });
    const SECONDS_PER_MONTH = 2592000n;
    const current_time = 1_700_000_000n;
    const threshold_months = 6n;
    const creation_timestamp =
      current_time - threshold_months * SECONDS_PER_MONTH + 1n;
    let threw = false;
    try {
      await circuit.calculateWitness(
        { creation_timestamp, current_time, threshold_months },
        true,
      );
    } catch {
      threw = true;
    }
    expect(threw).to.equal(true);
  });
});
