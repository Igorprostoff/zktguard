#!/usr/bin/env bash
#
# Generate a self-signed TLS certificate for the zktguard-stub server
# (v0.2 Phase B, Task B7). The cert is dev-only and gitignored — the
# attestor reaches the stub with --insecure-skip-verify.
#
# Output: attestor/certs/stub.crt, attestor/certs/stub.key
#
# Idempotent: skips generation if both files already exist. Set
# FORCE=1 to regenerate.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CERT_DIR="${CERT_DIR:-${ROOT}/certs}"
CRT="${CERT_DIR}/stub.crt"
KEY="${CERT_DIR}/stub.key"

mkdir -p "${CERT_DIR}"

if [ -f "${CRT}" ] && [ -f "${KEY}" ] && [ -z "${FORCE:-}" ]; then
  echo "stub cert already present at ${CRT} (set FORCE=1 to regenerate)."
  exit 0
fi

echo "==> generating self-signed stub cert (P-256, SAN=127.0.0.1,localhost)"
openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:prime256v1 \
  -keyout "${KEY}" -out "${CRT}" \
  -days 825 -nodes \
  -subj "/CN=zktguard-stub" \
  -addext "subjectAltName=IP:127.0.0.1,DNS:localhost" 2>/dev/null

chmod 600 "${KEY}"
echo "wrote ${CRT}"
echo "wrote ${KEY}"
echo "start the stub with: go run ./cmd/zktguard-stub --cert ${CRT} --key ${KEY}"
