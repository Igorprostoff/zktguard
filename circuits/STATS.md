# Circuit stats

zkTGuard v0.1 — `account_age` claim.

Constraint counts will be recorded here once the circuit compiles
end-to-end (i.e. once `circom` v2 is installed on the build machine and
the AEAD / JSON / commitment stubs are replaced with real bodies).

## Status of constraint groups

| # | Template                    | Status | Note |
| - | --------------------------- | ------ | ---- |
| 1 | `AEADDecrypt(N)`            | STUB   | Interface only. AES-128-GCM or ChaCha20-Poly1305 still TBD. Tens of thousands of constraints expected. |
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
