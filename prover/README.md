# prover

Reference prover service written in Rust, distributed as a single binary `zktguard-prover`. Accepts attestor output plus user secrets, generates a Groth16 proof over BLS12-381, and writes a proof and public inputs in a format the FunC verifier accepts.

The CLI is `zktguard-prover prove --input <json> --output <proof.json>`. Proving keys are loaded from the trusted setup artifacts produced by `scripts/setup.sh`. Mainnet operation would require either operator-run provers or client-side proving via Plonky3; both paths are described in the paper.
