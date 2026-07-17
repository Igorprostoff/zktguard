#!/usr/bin/env node
//
// Phase B end-to-end integration: stub → attestor → prover → verify,
// with a REAL (non-synthetic) Groth16 proof.
//
//   1. Start the Go stub over TLS 1.3 (self-signed cert).
//   2. Start the Go attestor pointed at it (--insecure-skip-verify).
//   3. POST /attest to get the ChaCha20-Poly1305 sealing.
//   4. Build the account_age witness exactly as the SDK does.
//   5. snarkjs.groth16.fullProve → proof + public signals.
//   6. snarkjs.groth16.verify against the committed VK → must pass.
//
// Run: pnpm test:integration:phase-b
//
// Requires: Go toolchain, and the built circuit artefacts
// (circuits/build/circuit_js/circuit.wasm, account_age_pkey.zkey,
// account_age/verification_key.json). Run circuits/scripts/setup.sh
// first if they are stale.

import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import net from "node:net";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const ATTESTOR_DIR = path.join(ROOT, "attestor");
const CIRCUITS = path.join(ROOT, "circuits");

// snarkjs from the circuits workspace.
const require = createRequire(path.join(CIRCUITS, "package.json"));
const snarkjs = require("snarkjs");

const WASM = path.join(CIRCUITS, "build", "circuit_js", "circuit.wasm");
const ZKEY = path.join(CIRCUITS, "build", "account_age_pkey.zkey");
const VK = path.join(CIRCUITS, "account_age", "verification_key.json");

const MAX_CT = 512;
const MAX_AAD = 16;

function fail(msg) {
  console.error(`\n✗ ${msg}`);
  process.exit(1);
}

for (const [label, p] of [["wasm", WASM], ["zkey", ZKEY], ["vk", VK]]) {
  if (!fs.existsSync(p)) {
    fail(`missing ${label} at ${p} — run circuits/scripts/setup.sh first`);
  }
}

function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
    srv.on("error", reject);
  });
}

async function waitFor(url, opts = {}, tries = 100) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, opts);
      if (r.ok || r.status === 405) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`service at ${url} never came up`);
}

function bytesToFieldStrings(bytes, len) {
  const out = new Array(len);
  for (let i = 0; i < len; i++) out[i] = String(i < bytes.length ? bytes[i] : 0);
  return out;
}

function hexToBytes(hex) {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(clean.slice(2 * i, 2 * i + 2), 16);
  }
  return out;
}

const procs = [];
function cleanup() {
  for (const p of procs) {
    try {
      p.kill("SIGKILL");
    } catch {
      /* ignore */
    }
  }
}
process.on("exit", cleanup);
process.on("SIGINT", () => {
  cleanup();
  process.exit(1);
});

async function main() {
  // 0. Ensure the stub TLS cert exists.
  const certDir = path.join(ATTESTOR_DIR, "certs");
  const crt = path.join(certDir, "stub.crt");
  const key = path.join(certDir, "stub.key");
  if (!fs.existsSync(crt) || !fs.existsSync(key)) {
    console.log("• generating stub TLS cert");
    const r = spawnSync("bash", ["scripts/gen_stub_cert.sh"], {
      cwd: ATTESTOR_DIR,
      stdio: "inherit",
    });
    if (r.status !== 0) fail("gen_stub_cert.sh failed");
  }

  const stubPort = await freePort();
  const attPort = await freePort();
  const stubURL = `https://127.0.0.1:${stubPort}`;
  const attURL = `http://127.0.0.1:${attPort}`;

  // 1. Stub over TLS.
  console.log(`• starting stub (TLS) on ${stubURL}`);
  const stub = spawn(
    "go",
    ["run", "./cmd/zktguard-stub", "--addr", `127.0.0.1:${stubPort}`, "--cert", crt, "--key", key],
    { cwd: ATTESTOR_DIR, stdio: ["ignore", "inherit", "inherit"], env: { ...process.env, CGO_ENABLED: "0" } },
  );
  procs.push(stub);

  // 2. Attestor.
  console.log(`• starting attestor on ${attURL}`);
  const att = spawn(
    "go",
    ["run", "./cmd/zktguard-attestor", "--addr", `127.0.0.1:${attPort}`, "--upstream", stubURL, "--insecure-skip-verify"],
    { cwd: ATTESTOR_DIR, stdio: ["ignore", "inherit", "inherit"], env: { ...process.env, CGO_ENABLED: "0" } },
  );
  procs.push(att);

  await waitFor(`${attURL}/health`);
  console.log("• attestor healthy");

  // 3. Seal.
  const attestResp = await fetch(`${attURL}/attest`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path: "/account" }),
  });
  if (!attestResp.ok) fail(`/attest returned ${attestResp.status}`);
  const sealing = await attestResp.json();
  if (sealing.created_at_offset < 0) fail("stub transcript has no created_at marker");
  console.log(`• sealed transcript (ct ${sealing.ciphertext_hex.length / 2} B, offset ${sealing.created_at_offset})`);

  // 4. Witness (mirrors sdk/src/index.ts requireClaim).
  const ct = hexToBytes(sealing.ciphertext_hex);
  const aad = hexToBytes(sealing.aad_hex);
  const chainId = 239n; // TON testnet convention
  const random = 424242n;
  const noncePacked = (chainId << 224n) | random;
  const now = BigInt(Math.floor(Date.now() / 1000));
  const witness = {
    nonce: noncePacked.toString(),
    app_id: "1",
    expiration: (now + 3600n).toString(),
    claim_type: "1",
    attestor_pubkey_x: sealing.pubkey_x,
    attestor_pubkey_y: sealing.pubkey_y,
    threshold_months: "12",
    user_secret: "271828182845904523536",
    current_time: now.toString(),
    timestamp_offset: String(sealing.created_at_offset),
    tls_key: bytesToFieldStrings(hexToBytes(sealing.key_hex), 32),
    tls_nonce: bytesToFieldStrings(hexToBytes(sealing.nonce_hex), 12),
    ciphertext: bytesToFieldStrings(ct, MAX_CT),
    ciphertext_length: String(ct.length),
    aad: bytesToFieldStrings(aad, MAX_AAD),
    aad_length: String(aad.length),
    tag: bytesToFieldStrings(hexToBytes(sealing.tag_hex), 16),
  };

  // 5. Prove.
  console.log("• generating Groth16 proof (real, not synthetic)…");
  const t0 = Date.now();
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(witness, WASM, ZKEY);
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`• proof generated in ${secs}s; nullifier = ${publicSignals[0]}`);

  // 6. Verify.
  const vk = JSON.parse(fs.readFileSync(VK, "utf8"));
  const ok = await snarkjs.groth16.verify(vk, publicSignals, proof);
  if (!ok) fail("proof failed verification against the committed VK");

  console.log("\n✓ Phase B end-to-end: stub → attestor → prover → verify PASSED");
  cleanup();
  // snarkjs keeps worker threads alive; force a clean exit.
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  cleanup();
  process.exit(1);
});
