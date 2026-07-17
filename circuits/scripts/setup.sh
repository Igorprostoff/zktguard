#!/usr/bin/env bash
#
# Deterministic Groth16 trusted setup for the v0.2 Phase-A account_age
# circuit on BLS12-381.
#
# Steps
#   1. Compile the circuit with `circom -p bls12381`.
#   2. Generate a local BLS12-381 PoT of capacity 2^POT_POWER
#      (default 19 — Phase B needs ≥ 250 k constraints) with a fixed
#      entropy seed (research-only, see PTAU.md).
#   3. Run `snarkjs groth16 setup` against the R1CS + PoT.
#   4. Phase-2 contribute with a fixed seed from PHASE2_SEED.txt.
#   5. Export the verification key to
#      `account_age/verification_key.json` (the only committed
#      artefact).
#
# Outputs (all under build/, none committed):
#   build/circuit.r1cs                — compiled R1CS
#   build/circuit_js/circuit.wasm     — witness generator
#   build/circuit.sym                 — debug symbols
#   build/pot${POT_POWER}_final.ptau   — finalised PoT
#   build/account_age_pkey.zkey       — proving key
#
# Outputs committed:
#   account_age/verification_key.json — VK consumed by the FunC
#                                       contract (baked in via
#                                       scripts/vk_to_func.js).
#
# Requires: circom v2.2+, pnpm, snarkjs (installed via the workspace).

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD="${ROOT}/build"
CIRCUIT="${ROOT}/account_age/circuit.circom"
VK_OUT="${ROOT}/account_age/verification_key.json"
PHASE2_SEED_FILE="${ROOT}/PHASE2_SEED.txt"
PHASE1_SEED="${PHASE1_SEED:-zktguard-deterministic-seed-0001}"
POT_POWER="${POT_POWER:-19}"

mkdir -p "${BUILD}"

step() { printf '\n==> %s\n' "$*"; }

# Guard: refuse to overwrite a committed VK unless the caller opts in.
# `powersoftau new` is non-deterministic across machines, so a clean
# re-run would produce a different VK and silently break the committed
# fixtures + FunC constants. Local devs who want to refresh use
# FORCE_REGEN=1; CI just runs against the committed artefacts.
if [ -f "${VK_OUT}" ] && [ -z "${FORCE_REGEN:-}" ]; then
  echo "verification_key.json exists; skipping (set FORCE_REGEN=1 to rebuild)."
  exit 0
fi

step "circom check"
if ! command -v circom >/dev/null 2>&1; then
  echo "circom v2 not on PATH; run scripts/install_circom.sh first." >&2
  exit 2
fi

step "compile circuit (BLS12-381)"
circom "${CIRCUIT}" \
  --r1cs --wasm --sym \
  -p bls12381 \
  -l "${ROOT}/node_modules" \
  -o "${BUILD}"

step "phase-1: powers of tau (deterministic local PoT, BLS12-381, 2^${POT_POWER})"
if [ ! -f "${BUILD}/pot${POT_POWER}_final.ptau" ]; then
  pnpm exec snarkjs powersoftau new bls12381 "${POT_POWER}" "${BUILD}/pot${POT_POWER}_0000.ptau" -v
  pnpm exec snarkjs powersoftau contribute \
    "${BUILD}/pot${POT_POWER}_0000.ptau" \
    "${BUILD}/pot${POT_POWER}_0001.ptau" \
    --name="zktguard v0.2 phase 1 research-grade local PoT" \
    -e="${PHASE1_SEED}"
  pnpm exec snarkjs powersoftau prepare phase2 \
    "${BUILD}/pot${POT_POWER}_0001.ptau" \
    "${BUILD}/pot${POT_POWER}_final.ptau"
fi

step "groth16 setup"
pnpm exec snarkjs groth16 setup \
  "${BUILD}/circuit.r1cs" \
  "${BUILD}/pot${POT_POWER}_final.ptau" \
  "${BUILD}/account_age_0000.zkey"

step "phase-2 contribution (deterministic seed from PHASE2_SEED.txt)"
PHASE2_SEED="$(head -n1 "${PHASE2_SEED_FILE}")"
pnpm exec snarkjs zkey contribute \
  "${BUILD}/account_age_0000.zkey" \
  "${BUILD}/account_age_pkey.zkey" \
  --name="zktguard v0.2 phase 2" \
  -e="${PHASE2_SEED}"

step "export verification key"
pnpm exec snarkjs zkey export verificationkey \
  "${BUILD}/account_age_pkey.zkey" \
  "${VK_OUT}"

step "summary"
if command -v sha256sum >/dev/null 2>&1; then
  sha256sum "${BUILD}/circuit.r1cs" \
            "${BUILD}/account_age_pkey.zkey" \
            "${VK_OUT}"
else
  shasum -a 256 "${BUILD}/circuit.r1cs" \
                "${BUILD}/account_age_pkey.zkey" \
                "${VK_OUT}"
fi

echo "wrote ${VK_OUT}"
echo "regenerate FunC constants with: node scripts/vk_to_func.js"
