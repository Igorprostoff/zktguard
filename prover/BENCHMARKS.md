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

## Real Groth16 prover — v0.2 Phase B (snarkjs)

The production proving path in v0.2 is `snarkjs.groth16` behind
`zktguard-prover-server`, not the Rust synthetic prover above.

Measured 2026-07-18 on the reference machine (Apple Silicon, Node
v24.3.0, snarkjs 0.7.4), full Phase-B `account_age` circuit —
**249 346 constraints** on BLS12-381, proving key from the 2^19 local
ceremony:

| Step | Wall time |
| ---- | --------- |
| Witness calculation (wasm, 59-byte transcript) | ~1.5 s |
| `groth16 prove` (`/usr/bin/time`, two runs)    | **10.0 s / 9.8 s** |
| `groth16 verify`                               | < 1 s |

Phase B targets (design doc §5): under 30 s — met; hard ceiling
90 s — comfortable margin.

Reproduce:

```bash
cd circuits
node scripts/gen_phase_b_input.js build/test/input.json
pnpm exec snarkjs wtns calculate build/test/circuit_js/circuit.wasm \
  build/test/input.json build/test/witness.wtns
time pnpm exec snarkjs groth16 prove build/account_age_pkey.zkey \
  build/test/witness.wtns build/proof.json build/public.json
```
