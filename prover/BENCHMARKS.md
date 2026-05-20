# Prover benchmarks

v0.1 only emits *synthetic* proofs (BLS12-381 scalar arithmetic + 3
fixed-base scalar multiplications + 1 inverse). Real Groth16 proving
costs land once Task 3 finalises the trusted setup and Task 2's stub
templates are replaced with real bodies.

## Synthetic prover (current)

Run:

```bash
cd prover
cargo run --release -- prove \
  --input ../examples/fixtures/sample-input.json \
  --output /tmp/proof.json \
  --timed
```

The `--timed` flag prints elapsed microseconds inside `prove()` to
stderr. Numbers below are from a 2024 Apple M2 (cargo 1.95, Rust 1.95,
`--release` build).

| Operation                      | Wall time |
| ------------------------------ | --------- |
| `prove()` end-to-end           | _populate after first release-mode run_ |
| ~ G1 scalar mul (a·G, c·G)     | _populate_ |
| ~ G2 scalar mul (b·H)          | _populate_ |
| Field inverse for δ⁻¹          | _populate_ |

To regenerate, run the command above and paste the reported
microseconds into this table.

## Real Groth16 prover (post-Task-3)

Numbers will go here once we have:

- a real R1CS produced by `circom`,
- a real proving key built with arkworks against a Phase-2 ceremony,
- the account_age circuit with its constraint groups replaced.

Targets:

- Mobile (M-class iOS / mid-tier Android): ≤ 30 s wall-clock at 1×10⁵ constraints.
- Desktop hosted prover: ≤ 1 s at 1×10⁵ constraints.
