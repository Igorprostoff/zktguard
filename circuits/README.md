# circuits

Circom circuits compiled to Groth16 over **BLS12-381**, matching TON's `BLS_PAIRING` precompile. The v0.2 Phase-A circuit proves that a Telegram account-creation timestamp predates a public threshold, that the user's nullifier is a deterministic function of `(user_secret, app_id, claim_type)`, and that the seven other public signals are bound to the proof. The full TLS-AEAD / JSON-extraction body lands in Phase B (per the v0.2 DoD).

The verification key lives at `account_age/verification_key.json` and is the canonical artefact baked into the on-chain Groth16 verifier (`contracts/verifier/groth16_verifier.fc`). Build outputs (R1CS, WASM, proving keys, witnesses, .ptau files) are gitignored.

## Toolchain

```bash
bash scripts/install_circom.sh     # builds circom v2.2.0 into ~/.cargo/bin
pnpm install
```

`install_circom.sh` requires `cargo`; install Rust via `rustup` first if it is not on PATH.

## Trusted setup

```bash
bash scripts/setup.sh              # idempotent — no-op when VK exists
FORCE_REGEN=1 bash scripts/setup.sh # full rebuild
```

The script compiles the circuit, generates a local BLS12-381 Powers of Tau ceremony, performs a deterministic Phase-2 contribution (seed in `PHASE2_SEED.txt`), and writes the VK. See `PTAU.md` for provenance and the research-grade caveat.

After regenerating, regenerate the FunC constants and paste them into the verifier contract:

```bash
node scripts/vk_to_func.js > /tmp/vk.txt
# paste the slice<…>() blocks into contracts/verifier/groth16_verifier.fc
```

## Tests

```bash
pnpm test
```

JS-only reference tests for the nullifier construction. The end-to-end "real Groth16 proof over BLS12-381" path is exercised by the sandbox tests in `contracts/` against the committed fixture in `contracts/tests/fixtures/phase_a_accept.json`.
