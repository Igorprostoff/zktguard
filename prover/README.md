# prover

Reference prover written in Rust, distributed as a single binary `zktguard-prover`. v0.1 generates **synthetic** Groth16 proofs against the placeholder VK baked into `contracts/verifier/groth16_verifier.fc` — enough to exercise the on-chain verifier end-to-end before the trusted setup (Task 3) and real circuit (Task 2) are finalised.

The CLI is:

```bash
cargo run --release -- prove --input <json> --output <proof.json>
```

See [`INPUT_SCHEMA.md`](INPUT_SCHEMA.md) for the input shape and [`BENCHMARKS.md`](BENCHMARKS.md) for timings.

## Tests

```bash
cargo test
```

Three unit tests confirm the synthetic proof satisfies the four-pair Groth16 pairing equation; one integration test spawns the CLI, parses its JSON output, decodes the BLS12-381 points, and re-verifies the equation.

## Trusted setup

`zktguard-prover` will load real Groth16 proving keys from `scripts/setup.sh` (Task 3) once that work lands. Until then the placeholder VK in `Cargo.toml`'s test inputs and `circuits/STATS.md` is the source of truth. The synthetic-vs-real interface is identical, so swapping the VK is the only step needed after Task 3.

