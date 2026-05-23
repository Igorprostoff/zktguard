---
id: architecture
title: Architecture
---

# Architecture

```
   ┌────────────────┐       ┌────────────┐
   │ Telegram-shaped│ HTTPS │   Proxy    │
   │   endpoint     │◄──────│  attestor  │  (Go, BabyJubjub EdDSA)
   │  (real / stub) │       └─────┬──────┘
   └────────────────┘             │  /attest
                                  ▼
                            ┌────────────┐
                            │   Prover   │  (Rust, BLS12-381)
                            │  zktguard- │
                            │  prover    │
                            └─────┬──────┘
                                  │  proof.json
                                  ▼
   ┌────────────┐           ┌────────────┐
   │  TON wallet│ TON Connect│ Mini App   │  (React + SDK)
   │ Tonkeeper… │◄──────────│  /miniapp  │
   └─────┬──────┘           └─────┬──────┘
         │  signed verify msg     │
         ▼                        │
   ┌────────────┐                 │  reads nullifier
   │  Verifier  │◄────────────────┘
   │  (FunC)    │
   └─────┬──────┘
         │ mint
         ▼
   ┌────────────┐
   │ Soulbound  │
   │ Collection │  → Soulbound Item (per credential)
   └────────────┘
```

## Components

| Component                       | Language | Repo path                          |
| ------------------------------- | -------- | ---------------------------------- |
| Proxy attestor                  | Go       | `attestor/`                        |
| Telegram-shaped stub server     | Go       | `attestor/stub/`                   |
| Reference prover                | Rust     | `prover/`                          |
| Pairing-check sanity contract   | FunC     | `contracts/sanity/`                |
| Groth16 verifier                | FunC     | `contracts/verifier/`              |
| Soulbound credential            | FunC     | `contracts/credential/`            |
| App registry                    | FunC     | `contracts/registry/`              |
| TypeScript SDK                  | TS       | `sdk/`                             |
| Reference Mini App              | React    | `miniapp/`                         |
| Example Mini Apps (quest, airdrop, dao) | React | `examples/`                |
| Circom circuits                 | Circom   | `circuits/account_age/`            |

## Data flow (happy path)

1. User opens the Mini App and connects a TON wallet.
2. Mini App calls `ZktGuardClient.requireClaim("account_age", …)`.
3. SDK hits the attestor's `/attest` endpoint with `path` + `nonce`.
4. Attestor pulls the upstream stub, hashes the body with Poseidon, signs with BabyJubjub EdDSA, returns the triple + body hex.
5. SDK builds the public-input vector, runs the synthetic prover in-process (v0.1) → `(A, B, C)`.
6. SDK builds the verifier message body (4 refs) and hands it to TON Connect.
7. User's wallet signs and broadcasts. Verifier checks the proof, records the nullifier, throws on any of 401–413.

## Phase C async flow

The verifier no longer mints synchronously. It parks an accepted proof
under a fresh `query_id`, asks the registry whether the
`(app_id, claim_type)` pair is registered, and on a positive reply
records the nullifier and sends a mint message to the soulbound
collection. The full state machine + bounce handling + gas budget per
hop live in
[`contracts/design/async-flow.md`](https://github.com/Igorprostoff/zktguard/blob/main/contracts/design/async-flow.md).

## End-to-end testing

The `miniapp/e2e/` workspace runs the Mini App against the live
v0.2 testnet deployment under Playwright. Wallet automation goes
through a sandbox stub that signs transactions with a hardcoded
testnet seed (`miniapp/e2e/wallet-stub/`) and broadcasts via
`@ton/ton`'s `TonClient` through the shared throttle wrapper. The
stub is injected via `window.__TONCONNECT_TEST_STUB__`, which the
Mini App's `src/connect.ts` reads in place of `@tonconnect/ui-react`
when present — no Tonkeeper, no QR code, no human approval required
in CI.

Four scenarios validate the live wiring:

| Scenario              | Asserts                                                        |
| --------------------- | -------------------------------------------------------------- |
| `happy-path`          | Connect → prove → mint, nullifier recorded                     |
| `expired-proof`       | Verifier rejects with exit 403 before the pairing check        |
| `replayed-nullifier`  | Second submission with same Poseidon hash rejected on reply    |
| `unregistered-app`    | Verifier parks, registry replies false, parked entry dropped   |

The suite runs as `pnpm --filter @zktguard/miniapp test:e2e` and
gates `v*` release tags via the `e2e-testnet` workflow. It is
deliberately not a PR-time check: testnet flakiness and rate limits
would slow review without catching anything the sandbox tests miss.

## What is _not_ wired in v0.1

- The verifier does **not** yet cross-message the Soulbound Collection on success. Cross-contract send is a Task 4 follow-up.
- The verifier does **not** yet query the App Registry on `(app_id, claim_type)`. v0 hard-codes the accepted pair.
- The circuit's AEAD / JSON / transcript-commitment groups are stubs. End-to-end provability lands with Task 3 + the real circuit bodies.
