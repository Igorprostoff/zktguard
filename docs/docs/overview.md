---
id: overview
slug: /
title: Overview
---

# zkTGuard

zkTGuard is an open-source research project that turns Telegram's existing trust signals into privacy-preserving on-chain credentials on TON. The construction is zkTLS plus a Groth16 verifier in FunC.

> Status: v0.1 pre-release. Nothing is audited. Do not deploy to mainnet.

## What you can do today

- Stand up the reference attestor (Go) against a local Telegram-shaped stub.
- Build a Groth16 proof with the reference prover (Rust).
- Deploy the FunC contracts to TON testnet and call `verify_claim` from a TON Connect-enabled Mini App.
- Drop the SDK into your own Mini App to gate any on-chain action behind a fresh credential.

## What you cannot do today

- **No mainnet.** v0.1 is testnet only.
- **No real Telegram traffic.** The attestor talks to a stub; production zkTLS would intercept real TLS records.
- **No real trusted-setup VK.** The contract embeds a placeholder verification key. Real proofs land with Task 3.
- **No hosted services, no telemetry, no fees, no token.** This is research code.

## Scope

The repository is a monorepo with the following workspaces:

| Workspace      | Purpose                                                             |
| -------------- | ------------------------------------------------------------------- |
| `circuits`     | Circom circuits compiling to Groth16 over BLS12-381                 |
| `contracts`    | FunC smart contracts (verifier, soulbound NFT, app registry, …)     |
| `attestor`     | Reference proxy attestor (Go) + Telegram-shaped stub                |
| `prover`       | Reference Rust prover CLI                                           |
| `sdk`          | TypeScript SDK published as `@zktguard/sdk`                         |
| `miniapp`      | Reference Telegram Mini App                                         |
| `examples`     | Quest gate, airdrop gate, DAO vote demos sharing one component      |
| `docs`         | This Docusaurus site                                                |
| `paper`        | LaTeX source for the IACR ePrint / arXiv writeup                    |

## License

MIT. See [`LICENSE`](https://github.com/Igorprostoff/zktguard/blob/main/LICENSE).
