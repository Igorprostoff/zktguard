# Powers of Tau

zkTGuard v0.2 Phase A uses a **research-grade local Powers of Tau**
ceremony for the BLS12-381 curve. v0.1's plan to download a published
Hermez (bn128) ceremony was abandoned for the curve-unification reasons
documented in `circuits/STATS.md` and the paper's Construction section:
the on-chain verifier reads BLS12-381 pairing precompiles, the prover
emits BLS12-381 Groth16 proofs, and the circuit must therefore target
BLS12-381 too.

There is no widely-published, small-scale BLS12-381 ceremony to draw
from. v0.2 generates one locally with a deterministic Phase-1 + Phase-2
contribution; v0.3 will participate in (or coordinate) a multi-party
ceremony.

## v0.2 pinned ceremony

| Field | Value |
| ----- | ----- |
| Curve | BLS12-381 |
| Phase-1 capacity | 2^19 (524 288 constraints; Phase B's circuit is ≈ 250 k) |
| Phase-1 entropy | `zktguard-deterministic-seed-0001` (research-only) |
| Phase-2 entropy | see `circuits/PHASE2_SEED.txt` |
| Tooling | `snarkjs` v0.7.4 |

Reproduce with:

```bash
cd circuits
bash scripts/install_circom.sh    # if circom is not on PATH yet
bash scripts/setup.sh
```

The script writes `circuits/build/pot19_final.ptau`,
`circuits/build/account_age_pkey.zkey`, and
`circuits/account_age/verification_key.json`. Of these, only the VK
is committed (the others are large and gitignored).

## Storage convention

The proving key (`.zkey`) and the PoT (`.ptau`) are **not** committed.
They are reproduced from source. Anyone running `scripts/setup.sh` on a
clean clone gets byte-identical files, since both phases are seeded
deterministically.

## Why not a community ceremony?

BLS12-381 small-degree ceremonies are rare. The Ethereum KZG ceremony
targets KZG (not Groth16) and uses a different capacity profile. The
PSE Hermez ceremony was bn128, and v0.2 explicitly moves off bn128.

A v0.3 follow-up will either:
- Run a multi-party Phase-2 with named contributors (research
  collaborators only — still no commercial relationships), or
- Wait for a credible community BLS12-381 ceremony to publish.

Either way, v0.2's local PoT is intentionally a research placeholder.
