# Powers of Tau

zkTGuard v0.1 will use a published community Powers-of-Tau ceremony
artifact. v0 does not run a new ceremony.

## Candidate ceremonies

| Ceremony | Curve | Max degree | URL |
| -------- | ----- | ---------- | --- |
| Hermez (PSE)   | bn128     | 2^28 | https://blog.hermez.io/hermez-cryptographic-setup/ |
| Aztec Ignition | bn128     | 2^25 | https://aztec.network/ignition |
| Ethereum KZG   | BLS12-381 | 2^15 | https://ceremony.ethereum.org |

## v0.1 pinned ceremony

```
ceremony:        Hermez (PSE) Phase 1
file:            powersOfTau28_hez_final_15.ptau
sha256:          46bd6c10cefe92b6b5d3e23ff5c8a1ed85cfd5b29ab9b96a4d59ae6e8c4a05d6
degree (2^k):    k = 15
constraint cap:  2^15 - 1 = 32 767
url:             https://hermez.s3-eu-west-1.amazonaws.com/powersOfTau28_hez_final_15.ptau
```

The `_15` capacity is enough for v0.1's circuit (≈8 k constraints once
the stubs are replaced, comfortable headroom). Larger capacities use
the same Hermez ceremony — bump the `_XX` suffix and re-pin both the
URL and the SHA-256 in `scripts/setup.sh`.

> The SHA-256 above is a placeholder pinned for v0.1 reproducibility
> tooling. Re-pin against the actual digest the first time
> `scripts/setup.sh` succeeds on a clean machine; CI then asserts the
> committed hash matches the downloaded file.

## Storage convention

The `.ptau` file is **not** committed (it can be hundreds of MB).
`scripts/setup.sh` downloads it on demand and verifies the SHA-256
above before using it.

## Phase 2

A deterministic Phase-2 contribution lives in `scripts/setup.sh`. The
seed is the constant `PHASE2_SEED` — override the env var to mix in
fresh entropy when running a real (non-deterministic) ceremony.
