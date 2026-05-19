# attestor

Reference proxy attestor written in Go, distributed as a single binary `zktguard-attestor`. The attestor forwards a TLS request to a Telegram-shaped endpoint, signs `H(ciphertext || nonce)` with BLS over BLS12-381, and returns the signed transcript so the prover can later prove statements about the plaintext in zero knowledge.

For v0 the attestor talks to a stub server with deterministic fixtures (`/attestor/stub`), not the real Telegram API. Key generation is handled by `scripts/gen_attestor_key.sh` and keys are never committed.
