# Powers of Tau

zkTGuard v0.1 will use a published community Powers-of-Tau ceremony
artifact. v0 does not run a new ceremony.

## Candidate ceremonies

| Ceremony | Curve | Max degree | URL |
| -------- | ----- | ---------- | --- |
| Hermez (PSE)   | bn128     | 2^28 | https://blog.hermez.io/hermez-cryptographic-setup/ |
| Aztec Ignition | bn128     | 2^25 | https://aztec.network/ignition |
| Ethereum KZG   | BLS12-381 | 2^15 | https://ceremony.ethereum.org |

Final choice will be pinned in this file with:

```
ceremony:        <name>
file:            <powersOfTau28_hez_finalXX.ptau>
sha256:          <hex digest>
degree (2^k):    k = ??
constraint cap:  2^k - 1 ≈ ?
```

## Storage convention

The `.ptau` file is **not** committed (the v0 candidate is multiple GB).
`scripts/setup.sh` downloads it on demand and verifies its SHA-256
against the digest pinned above.
