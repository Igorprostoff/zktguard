#!/usr/bin/env bash
#
# Fetch the Groth16 proving key that pairs with the committed
# verification_key.json. The zkey is ~169 MB (249 k constraints) —
# past GitHub's 100 MB in-repo limit — so it ships as a release asset
# instead (see circuits/.gitignore for the history).
#
# Idempotent: verifies the pinned SHA-256 and skips the download when
# the file is already present and correct. A hash mismatch aborts —
# a wrong proving key would produce proofs the committed VK rejects.
#
# Regenerating instead (changes the VK → requires verifier redeploy):
#   FORCE_REGEN=1 bash circuits/scripts/setup.sh

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST="${ROOT}/build/account_age_pkey.zkey"

RELEASE_TAG="pkey-v0.2"
ASSET_NAME="account_age_pkey.zkey"
ASSET_URL="https://github.com/Igorprostoff/zktguard/releases/download/${RELEASE_TAG}/${ASSET_NAME}"
EXPECTED_SHA256="93af85d48ce2fcefc9c65501466c1e10785b47d8ec17afb72fa8b03f36c629ec"

sha256() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  else
    shasum -a 256 "$1" | awk '{print $1}'
  fi
}

if [ -f "${DEST}" ]; then
  actual="$(sha256 "${DEST}")"
  if [ "${actual}" = "${EXPECTED_SHA256}" ]; then
    echo "proving key already present and verified (${DEST})"
    exit 0
  fi
  echo "proving key at ${DEST} has unexpected hash ${actual}; re-downloading."
fi

mkdir -p "${ROOT}/build"
echo "==> downloading ${ASSET_URL} (~169 MB)"
curl -fL --retry 3 -o "${DEST}.tmp" "${ASSET_URL}"

actual="$(sha256 "${DEST}.tmp")"
if [ "${actual}" != "${EXPECTED_SHA256}" ]; then
  rm -f "${DEST}.tmp"
  echo "ERROR: downloaded proving key hash ${actual}" >&2
  echo "       expected                    ${EXPECTED_SHA256}" >&2
  echo "Refusing to install a proving key that does not pair with the committed VK." >&2
  exit 1
fi
mv "${DEST}.tmp" "${DEST}"
echo "wrote ${DEST} (sha256 verified)"
