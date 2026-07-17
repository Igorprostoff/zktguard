# Circuit stats

zkTGuard — `account_age` claim.

## Phase B primitives (measured, circom 2.2.0, `-p bls12381`)

| Template          | Instantiation | Constraints | Note |
| ----------------- | ------------- | ----------- | ---- |
| `ChaCha20(1)`     | 1 × 64-B block  | 23 452 | Budget: < 50 000 per block. |
| `ChaCha20(2)`     | 2 × 64-B blocks | 46 542 | Marginal cost ≈ 23 090 per extra block. |
| `Poly1305(64)`    | 64-B message    |  2 793 | 5-limb lazy-reduction accumulator. |
| `Poly1305(256)`   | 256-B (16-block) message | 9 057 | Budget: < 60 000 for 16 blocks. |
| `ChaCha20Poly1305Decrypt(128, 16)` | 128-B ct, 16-B AAD | 74 264 | 3 keystream blocks (otk + 2 payload) + MAC + decrypt glue. |
| `ChaCha20Poly1305Decrypt(512, 16)` | 512-B ct, 16-B AAD | 225 944 | Budget (design doc §5): ChaCha20 < 400 k, Poly1305 < 60 k, glue < 20 k. |
| **`AccountAge(512, 16)` (full circuit)** | — | **249 346** | 235 202 non-linear + 14 144 linear. Target ceiling 1 M, hard ceiling 2 M — comfortably inside. PoT capacity 2^19. |

Bit-sliced state (32 signals per word) makes rotations free and XOR
one constraint per bit; only the mod-2^32 adds pay a 33-bit
re-decomposition. Measured via
`circom test/circuits/chacha20_bN.circom --r1cs -l node_modules -p bls12381`
then `snarkjs r1cs info`.

## Status of constraint groups

| # | Template                    | Status | Note |
| - | --------------------------- | ------ | ---- |
| 1 | `ChaCha20Poly1305Decrypt(maxCT, maxAAD)` | DONE (Phase B) | Replaces the v0.1 `AEADDecrypt` stub. RFC 8439 in full; tag mismatch fails witness generation. |
| 2 | `TranscriptCommitment(maxCT, maxAAD)`    | DONE (Phase B) | Poseidon fold (31-byte big-endian chunks) + outer digest over key/nonce/ct-hash/aad-hash/tag/lengths — the attestor's signing payload. Signature verified off-circuit in v0.2 (see below). |
| 3 | `JsonTimestampExtract(N)`   | DONE (Phase B) | One-hot window at a witnessed offset; `"created_at":` marker match + 10-digit ASCII decode. |
| 4 | `TimestampThreshold()`      | DONE   | 64-bit `LessEqThan`. ~1 k constraints. |
| 5 | `AttestorEdDSAVerify()`     | NOT WIRED (v0.3) | Template exists, but the circuit is BLS12-381 while the attestor signs EdDSA-BabyJubjub over BN254; a cross-field in-circuit verify is the flagged v0.3 item (design doc §6). The signature is checked off-circuit against the same `TranscriptCommitment` digest. |
| 6 | `NullifierPoseidon()`       | DONE   | Poseidon(3 inputs). ~300 constraints. |

## How to populate this file

```
cd circuits
pnpm build                          # compiles via scripts/build.sh
snarkjs r1cs info build/circuit.r1cs   # report total constraints / variables
```

## Architectural notes for the paper

- **Attestor curve mismatch.** Bible §C and DoD §Task 7 currently
  describe the attestor as signing with BLS12-381. BLS verification
  in-circuit is infeasible at v0 cost targets. The v0.1 implementation
  uses BabyJubjub EdDSA; the bible / Task 7 will need a small revision.
  The on-chain verifier still uses BLS12-381 for the Groth16 pairing
  check itself — that part of the architecture is unchanged.
- **AEAD in-circuit.** AES-GCM at scale dwarfs every other group put
  together. The construction may move to a forwarded-secret commitment
  or a separate proving stage in v1. Discussed in the paper's
  Limitations section.
