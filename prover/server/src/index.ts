/**
 * `zktguard-prover-server` — Node HTTP wrapper around snarkjs.
 *
 * Listens on PORT (default 7679). Exposes:
 *
 *   POST /prove   { claim, witness } → { aHex, bHex, cHex, publicInputs }
 *   GET  /health  → { status, timestamp }
 *
 * Configuration via env vars
 *   PORT             listen port (default 7679)
 *   ADDR             listen address (default 127.0.0.1)
 *   WASM_PATH        path to circuit.wasm produced by circom
 *                    (default: ../../circuits/build/circuit_js/circuit.wasm)
 *   PKEY_PATH        path to the proving key .zkey
 *                    (default: ../../circuits/build/account_age_pkey.zkey)
 *   VK_PATH          path to verification_key.json
 *                    (default: ../../circuits/account_age/verification_key.json)
 */
import http from "node:http";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
// @ts-expect-error snarkjs has no published types
import * as snarkjs from "snarkjs";
import { bls12_381 } from "@noble/curves/bls12-381";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");

const PORT = Number(process.env.PORT ?? 7679);
const ADDR = process.env.ADDR ?? "127.0.0.1";
const WASM_PATH = process.env.WASM_PATH ??
  path.join(REPO_ROOT, "circuits", "build", "circuit_js", "circuit.wasm");
const PKEY_PATH = process.env.PKEY_PATH ??
  path.join(REPO_ROOT, "circuits", "build", "account_age_pkey.zkey");

const G1 = bls12_381.G1.ProjectivePoint;
const G2 = bls12_381.G2.ProjectivePoint;
const Fp = bls12_381.fields.Fp;
const Fp2 = bls12_381.fields.Fp2;

function bytesToHexUpper(bytes: Uint8Array): string {
  let out = "";
  for (const b of bytes) {
    out += b.toString(16).padStart(2, "0");
  }
  return out.toUpperCase();
}

function g1FromSnarkjs(arr: string[]): InstanceType<typeof G1> {
  const x = BigInt(arr[0]);
  const y = BigInt(arr[1]);
  const z = BigInt(arr[2]);
  if (z !== 1n) throw new Error(`expected Z=1, got ${z}`);
  return G1.fromAffine({ x: Fp.create(x), y: Fp.create(y) });
}

function g2FromSnarkjs(arr: string[][]): InstanceType<typeof G2> {
  const x = { c0: BigInt(arr[0][0]), c1: BigInt(arr[0][1]) };
  const y = { c0: BigInt(arr[1][0]), c1: BigInt(arr[1][1]) };
  const z = { c0: BigInt(arr[2][0]), c1: BigInt(arr[2][1]) };
  if (z.c0 !== 1n || z.c1 !== 0n) {
    throw new Error(`expected projective Z=(1,0), got (${z.c0}, ${z.c1})`);
  }
  return G2.fromAffine({ x: Fp2.create(x), y: Fp2.create(y) });
}

interface ProveInputWitness {
  [k: string]: string | string[];
}

interface ProveRequest {
  claim?: string;
  witness: ProveInputWitness;
}

interface ProveResponse {
  aHex: string;
  bHex: string;
  cHex: string;
  publicInputs: string[];
}

export async function buildProof(witness: ProveInputWitness): Promise<ProveResponse> {
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    witness,
    WASM_PATH,
    PKEY_PATH,
  );
  const A = g1FromSnarkjs(proof.pi_a);
  const B = g2FromSnarkjs(proof.pi_b);
  const C = g1FromSnarkjs(proof.pi_c);
  return {
    aHex: bytesToHexUpper(A.toRawBytes(true)),
    bHex: bytesToHexUpper(B.toRawBytes(true)),
    cHex: bytesToHexUpper(C.toRawBytes(true)),
    publicInputs: publicSignals,
  };
}

function writeJSON(res: http.ServerResponse, code: number, body: unknown): void {
  res.writeHead(code, {
    "content-type": "application/json",
    // Permissive CORS so the Mini App (served from Vite on a
    // different origin in dev / Playwright) can reach the prover
    // from a browser.
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "Content-Type",
  });
  res.end(JSON.stringify(body));
}

async function handleAttest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  if (req.method !== "POST") {
    writeJSON(res, 405, { error: "POST only" });
    return;
  }
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  let body: ProveRequest;
  try {
    body = JSON.parse(Buffer.concat(chunks).toString("utf8")) as ProveRequest;
  } catch (e) {
    writeJSON(res, 400, { error: `bad json: ${(e as Error).message}` });
    return;
  }
  if (!body.witness || typeof body.witness !== "object") {
    writeJSON(res, 400, { error: "witness required" });
    return;
  }
  try {
    const out = await buildProof(body.witness);
    writeJSON(res, 200, out);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error("[prove]", e);
    writeJSON(res, 500, { error: `prove failed: ${(e as Error).message}` });
  }
}

export function makeServer(): http.Server {
  return http.createServer(async (req, res) => {
    if (!req.url) {
      writeJSON(res, 400, { error: "no url" });
      return;
    }
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET, POST, OPTIONS",
        "access-control-allow-headers": "Content-Type",
      });
      res.end();
      return;
    }
    if (req.url === "/health" && req.method === "GET") {
      writeJSON(res, 200, {
        status: "ok",
        timestamp: Math.floor(Date.now() / 1000),
      });
      return;
    }
    if (req.url === "/prove") {
      await handleAttest(req, res);
      return;
    }
    writeJSON(res, 404, { error: "not found" });
  });
}

const isMain = process.argv[1] === __filename;
if (isMain) {
  if (!fs.existsSync(WASM_PATH)) {
    // eslint-disable-next-line no-console
    console.error(`WASM_PATH does not exist: ${WASM_PATH}`);
    process.exit(2);
  }
  if (!fs.existsSync(PKEY_PATH)) {
    // eslint-disable-next-line no-console
    console.error(`PKEY_PATH does not exist: ${PKEY_PATH}`);
    process.exit(2);
  }
  makeServer().listen(PORT, ADDR, () => {
    // eslint-disable-next-line no-console
    console.error(`[zktguard-prover-server] listening on ${ADDR}:${PORT}`);
    // eslint-disable-next-line no-console
    console.error(`  wasm = ${WASM_PATH}`);
    // eslint-disable-next-line no-console
    console.error(`  pkey = ${PKEY_PATH}`);
  });
}
