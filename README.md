# zkTGuard

Open-source research project exploring how Telegram's existing trust signals can be turned into privacy-preserving on-chain credentials on TON, using zkTLS plus a Groth16 verifier in FunC.

This repository hosts a reference implementation and accompanying technical writeup. It is a research artifact, not a product.

> Status: v0 — pre-release. Nothing here is audited. Do not deploy to mainnet.

---

## What this is

A buildable, auditable cryptographic construction that lets a Telegram user prove facts about their own account to a TON smart contract, without revealing the account.

- **Proof system:** Groth16 over BLS12-381
- **In-circuit hash:** Poseidon
- **zkTLS approach:** proxy attestation (Reclaim-style), single attestor in v0
- **Target chain:** TON testnet
- **Credential:** non-transferable NFT, metadata is a hash
- **v0 claim:** "Telegram account creation timestamp is older than threshold T months"

## What this is not

- Not a hosted service. No central operator.
- No telemetry, no analytics, no remote logging.
- No fees, no token, no incentive program.
- No service-level commitments to any third party.

## Repository layout

```
circuits/    Circom circuits (Groth16 over BLS12-381)
contracts/   FunC smart contracts (verifier, soulbound NFT, registry)
sdk/         TypeScript SDK (@zktguard/sdk)
miniapp/     Reference Telegram Mini App
attestor/    Reference proxy attestor (Go)
prover/      Reference prover service (Rust)
docs/        Docusaurus documentation site
paper/       LaTeX source for the research paper
examples/    Reference Mini Apps using the SDK
```

Each workspace folder has its own `README.md` describing its purpose.

## Trust model

The proxy attestor must not collude with the prover. This is stated in the paper, stated here, and stated in the construction. No claim of unconditional security is made.

Production-grade operation (HSM key management, geographic distribution, slashing collateral, multi-attestor sets) is described in the paper but not implemented in v0.

## Reproducibility

Every component is intended to be reproducible from source. See `REPRODUCE.md` (forthcoming) for the canonical reproduction script and committed artifact hashes.

## Paper

A draft writeup will be posted to IACR ePrint or arXiv. Link will appear here once published.

## License

MIT. See `LICENSE`.

## Contributing

External contributions accepted via PR after the v0.1 release. Until then this is a solo research effort.
