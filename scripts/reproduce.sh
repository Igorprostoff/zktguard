#!/usr/bin/env bash
#
# Build every committed artefact and emit its sha256. Compared
# against REPRODUCE.md by CI; humans diff the output by eye.
#
# Steps (skipping any whose toolchain is missing):
#   1.  pnpm install --frozen-lockfile
#   2.  Compile every FunC contract via blueprint.
#   3.  Build the SDK bundle.
#   4.  Build the Go attestor binary.
#   5.  Build the Rust prover binary (release).
#   6.  Run scripts/setup.sh if circom is installed (writes
#       circuits/account_age/verification_key.json).
#
# Outputs a JSON-shaped table to stdout. Hashes are sha256-hex.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT}"

emit() { printf '%-40s  %s\n' "$1" "$2"; }
sha_of() { sha256sum "$1" | awk '{print $1}'; }

have() { command -v "$1" >/dev/null 2>&1; }

# ----- 1. pnpm -----
if have pnpm; then
  pnpm install --frozen-lockfile >/dev/null
else
  echo "pnpm missing — skipping JS workspaces" >&2
fi

# ----- 2. FunC contracts -----
if [ -d contracts ] && have pnpm; then
  (cd contracts && pnpm exec blueprint build --all >/dev/null 2>&1 || true)
fi

echo "# zktguard reproducibility hashes"
echo "# generated: $(date -u +%FT%TZ)"
echo

for f in contracts/build/PairingCheck.compiled.json \
         contracts/build/Groth16Verifier.compiled.json \
         contracts/build/SoulboundCollection.compiled.json \
         contracts/build/SoulboundItem.compiled.json \
         contracts/build/AppRegistry.compiled.json; do
  if [ -f "$f" ]; then
    emit "$f" "$(sha_of "$f")"
  fi
done

# ----- 3. SDK bundle -----
if have pnpm; then
  (cd sdk && pnpm build >/dev/null 2>&1 || true)
  for f in sdk/dist/index.mjs sdk/dist/index.js sdk/dist/index.d.ts; do
    [ -f "$f" ] && emit "$f" "$(sha_of "$f")"
  done
fi

# ----- 4. attestor -----
if have go; then
  (cd attestor && CGO_ENABLED=0 go build -o bin/zktguard-attestor ./cmd/zktguard-attestor >/dev/null 2>&1 || true)
  [ -f attestor/bin/zktguard-attestor ] && emit "attestor/bin/zktguard-attestor" "$(sha_of attestor/bin/zktguard-attestor)"
fi

# ----- 5. prover -----
if have cargo; then
  (cd prover && cargo build --release --quiet >/dev/null 2>&1 || true)
  for f in prover/target/release/zktguard-prover; do
    [ -f "$f" ] && emit "$f" "$(sha_of "$f")"
  done
fi

# ----- 6. circuit + vk -----
if have circom; then
  bash circuits/scripts/setup.sh >/dev/null 2>&1 || true
fi
for f in circuits/account_age/verification_key.json \
         circuits/build/account_age.r1cs \
         circuits/build/account_age_pkey.zkey; do
  if [ -f "$f" ]; then
    emit "$f" "$(sha_of "$f")"
  fi
done

echo
echo "# done"
