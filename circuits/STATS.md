# Circuit stats

zkTGuard — `account_age` claim.

## Phase B primitives (measured, circom 2.2.0, `-p bls12381`)

| Template          | Instantiation | Constraints | Note |
| ----------------- | ------------- | ----------- | ---- |
| `ChaCha20(1)`     | 1 × 64-B block  | 23 452 | Budget: < 50 000 per block. |
| `ChaCha20(2)`     | 2 × 64-B blocks | 46 542 | Marginal cost ≈ 23 090 per extra block. |
| `Poly1305(64)`    | 64-B message    |  2 793 | 5-limb lazy-reduction accumulator. |
| `Poly1305(256)`   | 256-B (16-block) message | 9 057 | Budget: < 60 000 for 16 blocks. |

Bit-sliced state (32 signals per word) makes rotations free and XOR
one constraint per bit; only the mod-2^32 adds pay a 33-bit
re-decomposition. Measured via
`circom test/circuits/chacha20_bN.circom --r1cs -l node_modules -p bls12381`
then `snarkjs r1cs info`.

## Status of constraint groups

| # | Template                    | Status | Note |
| - | --------------------------- | ------ | ---- |
| 1 | `AEADDecrypt(N)`            | STUB   | Being replaced in Phase B by `ChaCha20Poly1305Decrypt` (Tasks B2–B5). `ChaCha20(numBlocks)` and `Poly1305(maxMessageBytes)` done, measured above. |
| 2 | `TranscriptCommitment(N)`   | STUB   | Poseidon-fold of `ciphertext` + nonce; fold-tree not yet implemented for N > 15. |
| 3 | `JsonTimestampExtract(N)`   | STUB   | Positional lookup + digit decoding pending. |
| 4 | `TimestampThreshold()`      | DONE   | 64-bit `LessEqThan`. ~1 k constraints. |
| 5 | `AttestorEdDSAVerify()`     | DONE   | BabyJubjub EdDSA via circomlib. ~4 k constraints. |
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
