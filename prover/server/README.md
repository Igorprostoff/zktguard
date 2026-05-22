# prover/server

Node HTTP wrapper around snarkjs. The SDK's `requireClaim()` posts the
witness here; the server runs Groth16 proving against the v0.2 Phase-A
circuit + proving key and returns the proof bytes in the wire format
the on-chain verifier reads.

## Run

```bash
# Generate the proving key first if it isn't there yet.
bash ../../circuits/scripts/setup.sh

cd prover/server
pnpm install
pnpm start
```

The server logs the wasm + pkey it loaded and listens on
`127.0.0.1:7679` by default. Override with `PORT`, `ADDR`,
`WASM_PATH`, `PKEY_PATH`.

## Endpoints

| Path     | Method | Notes |
| -------- | ------ | ----- |
| `/health` | GET   | liveness probe; returns `{status,timestamp}` |
| `/prove`  | POST  | body: `{ claim?: string, witness: { ... } }`; returns `{ aHex, bHex, cHex, publicInputs[] }` |

The witness shape matches `circuits/scripts/sample_input.json`: 10
decimal-string fields covering the 7 public inputs plus the 3 private
witnesses.

## Tests

```bash
pnpm test
```

The unit suite covers /health, 404, and the input-validation paths.
The prove path is exercised end-to-end by the contracts sandbox suite
which loads a pre-baked fixture; the prover server only needs to
agree with snarkjs's output, which the test in
`circuits/test/phase_a.spec.ts` confirms.
