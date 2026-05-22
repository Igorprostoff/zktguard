---
id: demo
title: Five-minute demo
sidebar_position: 9
---

# Five-minute demo

Walk-through script for the v0.2 Mini App against the local off-chain
stack. The demo assumes Telegram + TON Connect on a phone or a desktop
browser; no production hosting is required.

> **Note.** This script targets the *local* deployment. A testnet
> deployment with real contract addresses is on the v0.3 roadmap
> (DoD Task D1 is gated on a funded testnet wallet, which this
> repository intentionally does not commit). When that ships, replace
> the `VITE_VERIFIER_ADDRESS` placeholder below with the testnet
> address from `contracts/DEPLOYMENTS.md`.

## Prereqs (one-time)

1. Clone the repo and install:
   ```bash
   git clone https://github.com/Igorprostoff/zktguard.git
   cd zktguard
   pnpm install
   ```
2. Install `circom` and run the trusted setup (≈90 s on a 2024 laptop):
   ```bash
   bash scripts/install_circom.sh
   bash circuits/scripts/setup.sh
   ```
3. Bring up the off-chain stack via Docker:
   ```bash
   docker compose -f infra/docker-compose.yml up -d
   ```
   (Or `pnpm --filter @zktguard/prover-server start`, plus
   `make -C attestor stub` and `make -C attestor attestor` in separate
   terminals — same outcome, fewer containers.)

## The five-minute path

1. **Open the Mini App.**
   ```bash
   pnpm --filter @zktguard/miniapp dev
   ```
   Browse to `http://127.0.0.1:5173`.

2. **Connect a wallet.** Tap the TON Connect button and choose your
   testnet-funded Tonkeeper / MyTonWallet account. Once the wallet
   address shows in the badge, the **Verify Telegram account age**
   button becomes active.

3. **Tap Verify.** The Mini App calls the attestor, then the prover
   server, then assembles a verifier message. The status badge cycles
   through `attesting → proving → submitting`.

4. **Sign the transaction.** TON Connect pops a confirmation in your
   wallet. The transaction carries the four-ref `op::verify_claim`
   body and ~0.5 TON for gas.

5. **Watch the credential land.** The verifier parks the proof, the
   registry replies, the soulbound collection mints. The Mini App
   polls `getProofStatus` until it returns `{ status: "minted" }` and
   shows the resulting credential block.

Expected wall time, end to end:

| Hop                                  | Wall time (rough) |
| ------------------------------------ | ----------------- |
| Attestor stub fetch + sign           | ~50 ms            |
| Prover server (snarkjs Groth16)      | 4–10 s            |
| Wallet sign + broadcast              | 5–15 s (UX bound) |
| On-chain verify + registry round-trip| 5–10 s            |
| Mint deploy                          | 3–5 s             |
| **Total**                            | ~20–40 s          |

## Failure modes worth mentioning

- **Connection refused on /attest.** The Docker stack hasn't finished
  starting. Try `docker compose ps` and re-run.
- **Prover responds 500.** Check `WASM_PATH` and `PKEY_PATH` point at
  files that exist (the Docker compose mounts them; bare-metal runs
  need env vars set).
- **Wallet rejects "exit code 433".** The verifier wasn't wired to a
  registry yet. Run `sendSetRegistry` from a script — see
  `contracts/scripts/`.
- **Wallet rejects with no exit code.** TON Connect's fee estimation
  might be off. Bump the `amount` field in `miniapp/src/flow.ts`.

## Recording a video

A 90-second walkthrough video (DoD Task D5) is recorded by hand on a
real iOS or Android device after a testnet deployment ships (Task
D1). The placeholder slot is `docs/static/demo.mp4`; until it lands,
this markdown is the canonical demo doc.
