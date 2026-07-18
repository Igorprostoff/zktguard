#!/usr/bin/env node
/* eslint-disable no-console */
//
// Generate a synthetic Phase-B witness input for the account_age
// circuit: a compact-JSON Telegram-shaped transcript sealed with
// ChaCha20-Poly1305 (Node/OpenSSL), plus the surrounding public
// signals. Used for the committed contracts fixture and the proving
// benchmark.
//
// Usage:
//   node scripts/gen_phase_b_input.js [out_input.json]
//
// Deterministic: keys/nonces are fixed so the fixture is stable.

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const params = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, "..", "account_age", "params.json"),
    "utf8",
  ),
);
const MAX_CT = params.maxCiphertextBytes;
const MAX_AAD = params.maxAADBytes;

const outPath =
  process.argv[2] ?? path.join(__dirname, "..", "build", "input.json");

// Fixed material — research fixture, not a secret.
const key = Buffer.alloc(32, 7);
const nonce = Buffer.alloc(12, 9);
const aad = Buffer.from("tg-v1", "ascii");

const createdAt = 1231006505; // 2009-01-03
const now = 1750000000;       // fixed current_time (2025-06-15)
const json = `{"id":987654321,"created_at":${createdAt},"username":"alice"}`;
const pt = Buffer.from(json, "ascii");
const offset = json.indexOf('"created_at"');

const cipher = crypto.createCipheriv("chacha20-poly1305", key, nonce, {
  authTagLength: 16,
});
cipher.setAAD(aad, { plaintextLength: pt.length });
const ct = Buffer.concat([cipher.update(pt), cipher.final()]);
const tag = cipher.getAuthTag();

const pad = (buf, len) => {
  const out = Buffer.alloc(len);
  buf.copy(out);
  return Array.from(out);
};

const input = {
  nonce: ((1n << 224n) | 424242n).toString(), // chain_id 1 = FunC verifier CHAIN_ID (testnet binding)
  app_id: "1",
  // Far future (2033): the committed contracts fixture must not
  // expire on the sandbox's real clock.
  expiration: "2000000000",
  claim_type: "1",
  attestor_pubkey_x: "11",
  attestor_pubkey_y: "12",
  threshold_months: "12",
  user_secret: "271828182845904523536",
  current_time: String(now),
  timestamp_offset: String(offset),
  tls_key: Array.from(key),
  tls_nonce: Array.from(nonce),
  ciphertext: pad(ct, MAX_CT),
  ciphertext_length: String(ct.length),
  aad: pad(aad, MAX_AAD),
  aad_length: String(aad.length),
  tag: Array.from(tag),
};

fs.writeFileSync(outPath, JSON.stringify(input, null, 1));
console.log(`wrote ${outPath} (ct ${ct.length} B, offset ${offset})`);
