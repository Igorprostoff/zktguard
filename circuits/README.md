# circuits

Circom circuits compiled to Groth16 over BLS12-381. The v0 circuit proves that a Telegram account creation timestamp, extracted from an attestor-signed TLS transcript, is older than a public threshold. Poseidon is used for nullifiers and any in-circuit commitments. SHA-256 is used only where the external protocol (TLS, JWT) mandates it.

Build outputs (R1CS, WASM, proving/verification keys, witnesses) are gitignored. The verification key for the v0 claim is checked in once the trusted setup is finalized.
