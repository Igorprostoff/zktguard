# attestor

Reference proxy attestor written in Go, distributed as a single binary `zktguard-attestor`. It forwards a request to a Telegram-shaped endpoint, hashes the response body with Poseidon, and signs the digest with EdDSA on the BabyJubjub curve so the prover can verify the signature in-circuit.

> **Curve note.** The bible's Part C and Task 7 originally call for BLS12-381 signing. BLS verification inside a Groth16 circuit is infeasible at v0 cost targets, so v0.1 uses BabyJubjub EdDSA — the canonical circuit-friendly choice. Tracked in `/circuits/STATS.md`.

For v0 the attestor talks to a stub server with deterministic fixtures (`/attestor/stub`), not the real Telegram API. Key generation is handled by `scripts/gen_attestor_key.sh` and keys are never committed.

## Layout

```
cmd/zktguard-attestor    HTTP service (this is the main binary)
cmd/zktguard-stub        Stub Telegram-shaped upstream for tests / dev
internal/attestor        Key handling + Poseidon-digest signing
internal/httpapi         HTTP handlers for /health, /pubkey, /attest
stub                     Stub server library used by tests + the stub CLI
scripts/gen_attestor_key.sh   Writes a fresh 64-hex-char key to disk
Makefile                 build / test / run helpers
```

## Quickstart

```bash
cd attestor
make key                                  # writes keys/attestor.hex (mode 600, gitignored)
make stub  && ./bin/zktguard-stub &       # http://127.0.0.1:7676
make attestor && ./bin/zktguard-attestor \
  --addr 127.0.0.1:7677 \
  --upstream http://127.0.0.1:7676 \
  --key keys/attestor.hex
```

Then:

```bash
curl -s http://127.0.0.1:7677/health | jq
curl -s http://127.0.0.1:7677/pubkey | jq
curl -s -X POST http://127.0.0.1:7677/attest \
  -H 'content-type: application/json' \
  -d '{"path":"/account","nonce":"12345"}' | jq
```

## HTTP endpoints

| Path     | Method | Notes |
| -------- | ------ | ----- |
| `/health` | GET   | liveness probe; returns `{status,timestamp}` |
| `/pubkey` | GET   | returns the BabyJubjub public key as decimal `{x,y}` |
| `/attest` | POST  | body: `{"path":"/account","nonce":"<decimal>"}`; returns ciphertext-hash, transcript digest, EdDSA triple, pubkey |

## Tests

```bash
make test
```

CGO is disabled by default in the Makefile to work around a macOS Sonoma + Go 1.21 linker regression. Linux CI is unaffected.
