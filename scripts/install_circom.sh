#!/usr/bin/env bash
#
# Build circom v2 from source and install it to ~/.cargo/bin.
#
# Works on macOS (no prebuilt iden3 binaries) and Linux. CI uses the
# same script, with a cargo cache keyed on CIRCOM_REV.
#
# Env vars
#   CIRCOM_REV : git tag or commit to build (default: v2.2.0)
#   CARGO_BIN  : install destination (default: ~/.cargo/bin)

set -euo pipefail

CIRCOM_REV="${CIRCOM_REV:-v2.2.0}"
CARGO_BIN="${CARGO_BIN:-$HOME/.cargo/bin}"

if command -v circom >/dev/null 2>&1; then
  installed="$(circom --version 2>&1 | head -n1 | awk '{print $NF}' || true)"
  echo "circom already installed: ${installed}"
  exit 0
fi

if ! command -v cargo >/dev/null 2>&1; then
  echo "cargo not found; install rustup first (https://rustup.rs)" >&2
  exit 2
fi

echo "==> building circom ${CIRCOM_REV} from source (this can take 2-4 minutes)"
cargo install --locked --git https://github.com/iden3/circom.git \
  --tag "${CIRCOM_REV}" --root "${HOME}/.cargo"

if ! command -v circom >/dev/null 2>&1; then
  echo "==> ${CARGO_BIN}/circom built; ensure it is on PATH" >&2
fi

circom --version
