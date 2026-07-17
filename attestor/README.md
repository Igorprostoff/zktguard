# attestor

Reference proxy attestor written in Go, distributed as a single binary `zktguard-attestor`. It fetches a Telegram-shaped endpoint **over TLS 1.3**, seals the response body with **ChaCha20-Poly1305** under a key derived from the TLS session, and signs a Poseidon commitment over that sealing with EdDSA-BabyJubjub. The prover witnesses the `(key, nonce, ciphertext, aad, tag)` tuple; the circuit verifies the ChaCha20-Poly1305 decryption in-circuit (v0.2 Phase B).

> **Curve note.** The bible's Part C and Task 7 originally call for BLS12-381 signing. BLS verification inside a Groth16 circuit is infeasible at v0 cost targets, so the attestor signs with BabyJubjub EdDSA — the canonical circuit-friendly choice. Tracked in `/circuits/STATS.md`.

## v0.2 Phase B: the ChaCha20-Poly1305 cipher-suite constraint

The circuit only verifies ChaCha20-Poly1305, so the attestor only ever emits ChaCha20-Poly1305 sealings. How the session key is obtained matters:

- **Go stdlib limitation.** `crypto/tls` (through Go 1.22) does **not** let a caller restrict the TLS 1.3 cipher-suite list, and does **not** expose TLS 1.3 record keys. So neither "advertise only `TLS_CHACHA20_POLY1305_SHA256`" nor raw record-key extraction is possible without vendoring a forked TLS stack.
- **What the attestor does instead.** It pins the upstream client to TLS 1.3 (`MinVersion` 1.3) and derives the sealing key/nonce from the standard **RFC 5705 exporter** (`ConnectionState.ExportKeyingMaterial`), which is cipher-suite-independent, always available in TLS 1.3, and works unprivileged on macOS and Linux. A fresh 16-byte salt per seal (the exporter *context*) guarantees the key/nonce are unique even when TLS keep-alive reuses one session — otherwise two seals would reuse a ChaCha20 keystream.
- **Trust boundary.** This proves *a* ChaCha20-Poly1305 record the attestor produced from a body it fetched over an authenticated TLS session — not the upstream's own TLS record layer. This is the proxy-attestation model; see `paper/design/chacha20-circuit.md` §6. A non-TLS upstream yields no exporter and is rejected.

For dev the attestor talks to the local stub (`/attestor/stub`), which terminates TLS with a self-signed cert (`scripts/gen_stub_cert.sh`); reach it with `--insecure-skip-verify`. Key generation is handled by `scripts/gen_attestor_key.sh` and keys are never committed.

## Layout

```
cmd/zktguard-attestor    HTTP service (this is the main binary)
cmd/zktguard-stub        Stub Telegram-shaped upstream (TLS 1.3) for tests / dev
internal/attestor        Key handling + EdDSA-BabyJubjub digest signing
internal/session         TLS-session → ChaCha20-Poly1305 sealing + Poseidon commitment
internal/httpapi         HTTP handlers for /health, /pubkey, /attest
stub                     Stub server library used by tests + the stub CLI
scripts/gen_attestor_key.sh   Writes a fresh 64-hex-char key to disk
scripts/gen_stub_cert.sh      Writes a self-signed TLS cert for the stub (gitignored)
Makefile                 build / test / run helpers
```

## Quickstart

```bash
cd attestor
make key                                  # writes keys/attestor.hex (mode 600, gitignored)
bash scripts/gen_stub_cert.sh             # writes certs/stub.{crt,key} (gitignored)
make stub && ./bin/zktguard-stub \
  --cert certs/stub.crt --key certs/stub.key &   # https://127.0.0.1:7676
make attestor && ./bin/zktguard-attestor \
  --addr 127.0.0.1:7677 \
  --upstream https://127.0.0.1:7676 \
  --insecure-skip-verify \
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
| `/attest` | POST  | body: `{"path":"/account","nonce":"<decimal, optional>"}`; returns the ChaCha20-Poly1305 sealing (`key/nonce/salt/aad/ciphertext/tag` hex), the Poseidon `transcript_digest`, the EdDSA triple, and the pubkey |

The `/attest` response schema changed in v0.2 Phase B (it now returns the sealing tuple, not the plaintext body hash). v0.1 clients break — acceptable for the v0.2 release.

## Flags

| Flag | Default | Notes |
| ---- | ------- | ----- |
| `--upstream` | `https://127.0.0.1:7676` | upstream URL; must be TLS 1.3 |
| `--insecure-skip-verify` | `false` | skip upstream cert verification — **dev only**, for the self-signed stub cert |
| `--key` | (ephemeral) | 64-hex-char signing key; a fresh key is generated when empty |

## Tests

```bash
make test
```

CGO is disabled by default in the Makefile to work around a macOS Sonoma + Go 1.21 linker regression. Linux CI is unaffected.
