---
id: construction
title: Cryptographic construction
---

# Cryptographic construction

This page is the math refresher the bible refers to. It assumes
familiarity with Groth16 and BLS12-381 but explains the choices that
are specific to zkTGuard.

## Notation

- `r` — order of the BLS12-381 scalar field.
- `G` — generator of `G1`.
- `H` — generator of `G2`.
- `e: G1 × G2 → GT` — type-3 Ate pairing on BLS12-381.

## Verification equation

The Groth16 equation we land in v0.1 is the standard one, with public
input vector `pi = (pi_0, …, pi_7)`:

```
e(A, B) = e(α·G, β·H) · e(vk_x, γ·H) · e(C, δ·H)
vk_x   = IC[0] + Σ_{i=0..7} IC[i+1] · pi_i
```

Equivalently, the four-pair check the FunC verifier runs on chain:

```
e(A, B) · e(-α·G, β·H) · e(-vk_x, γ·H) · e(-C, δ·H) == 1
```

The `BLS_PAIRING` opcode on TON computes the product directly. See
`contracts/verifier/groth16_verifier.fc`.

## Public inputs

Order matches the `public []` directive in
`circuits/account_age/circuit.circom`:

| Index | Field              | Notes |
| ----- | ------------------ | ----- |
| 0     | `nonce`            | High 32 bits carry `chain_id` (replay protection) |
| 1     | `app_id`           | Verifier looks this up in the registry            |
| 2     | `expiration`       | Unix seconds; rejected if `< now()`               |
| 3     | `claim_type`       | Stable enum; v0 ships `account_age = 1`           |
| 4     | `nullifier`        | `Poseidon(user_secret, app_id, claim_type)`        |
| 5     | `attestor_pubkey_x`| BabyJubjub coords of the attestor                  |
| 6     | `attestor_pubkey_y`| BabyJubjub coords of the attestor                  |
| 7     | `threshold_months` | Account age must exceed `threshold_months × 30d`   |

## Constraint groups inside the circuit

1. **AEADDecrypt** — `decrypt(ciphertext, key, iv) == plaintext`. Stubbed in v0.1; real bodies land alongside Task 3.
2. **TranscriptCommitment** — `Poseidon(ciphertext, nonce) == transcript_hash`. Stubbed in v0.1.
3. **JsonTimestampExtract** — read `creation_timestamp` from `plaintext` at a witnessed offset. Stubbed in v0.1.
4. **TimestampThreshold** — `creation_timestamp ≤ now − threshold_months × 2_592_000`.
5. **AttestorEdDSAVerify** — `EdDSA-BabyJubjub` verify of attestor's signature over `transcript_hash`. Done.
6. **NullifierPoseidon** — `nullifier == Poseidon(user_secret, app_id, claim_type)`. Done.

## Trust model

The construction follows the proxy-attestation model (Reclaim-style).
The attestor must not collude with the prover; if it does, sybil
resistance breaks.

The bible's Part C originally specifies BLS12-381 for the attestor
signing curve. BabyJubjub EdDSA is used instead in v0.1 because BLS
verification inside a Groth16/bn128 circuit is infeasible at the
required constraint budgets. This deviation is tracked in
`circuits/STATS.md`.

## Nullifier

```
nullifier = Poseidon(user_secret, app_id, claim_type)
```

Per-`(app_id, claim_type)`, per-`user_secret`, deterministic.
Unlinkable across apps because the Poseidon pre-image differs.

## Chain ID

The 256-bit `nonce` field is split:

```
nonce = (chain_id << 224) | random
```

The verifier checks `chain_id == CHAIN_ID` (constant compiled in) and
throws exit code 405 otherwise. This is the v0 binding; cryptographic
binding without an extra public input is documented as an open issue
for the paper.
