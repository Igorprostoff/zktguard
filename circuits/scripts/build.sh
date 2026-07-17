#!/usr/bin/env bash
#
# Compile every Circom circuit in zkTGuard.
#
# Requires `circom` v2.1+ on PATH. The compiler is a Rust binary; iden3 do
# not ship pre-built mac binaries, so install from source:
#
#   git clone https://github.com/iden3/circom.git
#   cd circom && cargo install --path circom
#
# Or pin to a known release via crates.io once one ships.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="${ROOT}/build"
mkdir -p "${OUT}"

if ! command -v circom >/dev/null 2>&1; then
  echo "circom v2 not found on PATH; skipping circuit build." >&2
  echo "see scripts/build.sh for install steps." >&2
  exit 0
fi

CIRCUITS=(
  "account_age/circuit.circom"
)

for c in "${CIRCUITS[@]}"; do
  name="$(basename "${c%.circom}")"
  dir="$(dirname "$c")"
  echo "compiling $c"
  circom "${ROOT}/${c}" \
    --r1cs --wasm --sym \
    -p bls12381 \
    -l "${ROOT}/node_modules" \
    -o "${OUT}"
  echo "  → ${OUT}/${name}.r1cs"
done
