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
| `contracts/build/Groth16Verifier.compiled.json`     | `2b0a3af099e5ee3aff46c29143ef8b3123bd609e47c02e5401a787f84f0ff599` |
| `contracts/build/SoulboundCollection.compiled.json` | `0f26c9d510769c3eb31270c3eb9159a2fc2b47d69ec94a071101fc560dd3433b` |
| `contracts/build/SoulboundItem.compiled.json`       | `13e1ce5ab92bf27d746cdfd58e7c9c30c0060edfb5d8b235ecfb465ac0e3aa0e` |
| `contracts/build/AppRegistry.compiled.json`         | `bc712d0d2d8923736f78ec7e167dc420ef88c30a1c7167f00e78af3f03494979` |
| `sdk/dist/index.mjs`                                | `0fdd8f84bdb4a9289a98aa81600c41a6b7bb0a17d86778c91e7eaf9b6e399580` |
| `sdk/dist/index.js`                                 | `af7bda78c7e214935333cecea7872f3a5b18f45842095617abf6796ddfb90ceb` |
| `sdk/dist/index.d.ts`                               | `05238c6d0926b4da211ccd39c41efe7f923f38785c23637497b00d3b5ef68841` |
| `circuits/account_age/verification_key.json`        | `80f52ddf68829dd09782f56570b1b2787e3f4b4e180dc9a4be88e54dcd99e243` |

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
