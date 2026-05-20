#!/usr/bin/env bash
#
# Generate a 256-bit attestor private key and write it as 64 hex
# characters to the path supplied by $1 (default: keys/attestor.hex).
# Refuses to overwrite an existing file.
#
# The generated key file should never be committed — keys/ is in
# attestor/.gitignore.

set -euo pipefail

out="${1:-keys/attestor.hex}"
mkdir -p "$(dirname "$out")"

if [ -e "$out" ]; then
  echo "refusing to overwrite existing key at $out" >&2
  exit 2
fi

# 32 bytes -> 64 hex chars. /dev/urandom is fine for a dev key; production
# would use an HSM-backed key generation flow.
hex="$(head -c 32 /dev/urandom | xxd -p -c 64)"
printf '%s' "$hex" > "$out"
chmod 0600 "$out"

echo "wrote $out (${#hex} hex chars)"
