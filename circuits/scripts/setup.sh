#!/usr/bin/env bash
#
# Deterministic Groth16 trusted setup for the v0.1 account_age circuit.
#
# Inputs
#   PTAU_URL  : public Powers-of-Tau URL (see ../PTAU.md)
#   PTAU_SHA  : sha256 of the .ptau file (see ../PTAU.md)
#   PHASE2_SEED : 32-byte hex seed used for the Phase-2 contribution.
#                 Defaults to a fixed value so CI can re-derive the
#                 same proving / verification keys.
#
# Outputs
#   build/account_age.r1cs                   — compiled R1CS
#   build/account_age.wasm                   — witness generator
#   build/account_age.sym                    — debug symbols
#   build/account_age_pkey.zkey              — proving key
#   account_age/verification_key.json        — verification key (committed)
#
# Requires: circom v2.1+, snarkjs (via the workspace), curl, sha256sum.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD="${ROOT}/build"
CIRCUIT="${ROOT}/account_age/circuit.circom"
VK_OUT="${ROOT}/account_age/verification_key.json"

PTAU_URL="${PTAU_URL:-https://hermez.s3-eu-west-1.amazonaws.com/powersOfTau28_hez_final_15.ptau}"
PTAU_SHA="${PTAU_SHA:-46bd6c10cefe92b6b5d3e23ff5c8a1ed85cfd5b29ab9b96a4d59ae6e8c4a05d6}"
PTAU_FILE="${BUILD}/powersOfTau28_hez_final_15.ptau"
PHASE2_SEED="${PHASE2_SEED:-fbf7a9bf57cdc8f7d8c5e3c0f7a4b3a2c1d0e9f8a7b6c5d4e3f2a1b0c9d8e7f6}"

mkdir -p "${BUILD}"

step() { printf '\n==> %s\n' "$*"; }

step "circom"
if ! command -v circom >/dev/null; then
  echo "circom v2 not on PATH; install from https://github.com/iden3/circom" >&2
  exit 2
fi
circom "${CIRCUIT}" \
  --r1cs --wasm --sym \
  -l "${ROOT}/node_modules" \
  -o "${BUILD}"

step "fetch ptau"
if [ ! -f "${PTAU_FILE}" ]; then
  curl -L --fail -o "${PTAU_FILE}" "${PTAU_URL}"
fi
actual_sha="$(sha256sum "${PTAU_FILE}" | awk '{print $1}')"
if [ "${actual_sha}" != "${PTAU_SHA}" ]; then
  echo "ptau sha256 mismatch: expected ${PTAU_SHA}, got ${actual_sha}" >&2
  exit 3
fi

step "groth16 setup (phase 2 round 0)"
pnpm exec snarkjs groth16 setup \
  "${BUILD}/account_age.r1cs" \
  "${PTAU_FILE}" \
  "${BUILD}/account_age_0000.zkey"

step "phase 2 contribution"
# Deterministic Phase-2 contribution: snarkjs reads entropy from the
# `--entropy` flag, so a fixed seed reproduces the same key.
pnpm exec snarkjs zkey contribute \
  "${BUILD}/account_age_0000.zkey" \
  "${BUILD}/account_age_pkey.zkey" \
  --name="zktguard v0.1" \
  --entropy="${PHASE2_SEED}"

step "export verification key"
pnpm exec snarkjs zkey export verificationkey \
  "${BUILD}/account_age_pkey.zkey" \
  "${VK_OUT}"

step "summary"
sha256sum "${BUILD}/account_age.r1cs" \
          "${BUILD}/account_age_pkey.zkey" \
          "${VK_OUT}"

echo "wrote ${VK_OUT}"
