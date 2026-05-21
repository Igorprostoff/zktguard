# Reproducibility

Run `bash scripts/reproduce.sh` from a clean clone. The script builds
every committed artifact and prints `<path>  <sha256>` for each. The
table below lists the artifacts that should hash identically across
machines.

## Deterministic artifacts

These hashes only change when the source changes — they do not depend
on toolchain version or host architecture. CI compares the live run
to this table and fails on any mismatch.

| Path                                                | sha256 |
| --------------------------------------------------- | ------ |
| `contracts/build/PairingCheck.compiled.json`        | `8fea98464ee76b475c26d865389625e13f9ea19410728712d415324eefb9f567` |
| `contracts/build/Groth16Verifier.compiled.json`     | `774b811b5417ba4975964fd3cf702ddfc05b92a1be0022b214453d858ae10a11` |
| `contracts/build/SoulboundCollection.compiled.json` | `0f26c9d510769c3eb31270c3eb9159a2fc2b47d69ec94a071101fc560dd3433b` |
| `contracts/build/SoulboundItem.compiled.json`       | `13e1ce5ab92bf27d746cdfd58e7c9c30c0060edfb5d8b235ecfb465ac0e3aa0e` |
| `contracts/build/AppRegistry.compiled.json`         | `bc712d0d2d8923736f78ec7e167dc420ef88c30a1c7167f00e78af3f03494979` |
| `sdk/dist/index.mjs`                                | `430e9781fecfc8e1066f66ff6a4685cd255346c162964851b78e68e07dbf0b50` |
| `sdk/dist/index.js`                                 | `51d26274e390eb7a57e340cc55e36c0e85dc0e2807b61839cc22bbf586dc5865` |
| `sdk/dist/index.d.ts`                               | `b8dd843f8701ec5a9544d4332750216ac082bd36745716de0743bc9181c48855` |
| `circuits/account_age/verification_key.json`        | `21177ad115ad2801b6d2298739ae64db0d6b422faf90846926d9679258bd5cb9` |

## Host-dependent artifacts

Native binaries embed toolchain version / build-id metadata, so their
hashes differ across machines. The script still prints the hash for
local verification, but CI does not assert on it.

- `attestor/bin/zktguard-attestor` — Go-built binary
- `prover/target/release/zktguard-prover` — Rust-built binary

## Regenerating the table

After a deliberate source change that bumps one of the deterministic
hashes:

```bash
bash scripts/reproduce.sh
# paste the new sha into the table above
git commit -m "chore(repro): refresh deterministic hashes"
```

CI runs `bash scripts/reproduce.sh && python3 - <<EOF` to compare the
output against this file; see `.github/workflows/ci.yml`.
