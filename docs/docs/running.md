---
id: running
title: Running the reference implementation
---

# Running the reference implementation

The full flow uses four processes (attestor stub, attestor, Mini App,
TON sandbox or testnet). Everything can be exercised on a single
machine.

## Prerequisites

- Node 20+, pnpm 9
- Go 1.21+
- Rust 1.95+ (`rustup`)
- TON testnet wallet with a small balance (only if you want to broadcast)

## One-time install

```bash
git clone https://github.com/Igorprostoff/zktguard.git
cd zktguard
pnpm install
. "$HOME/.cargo/env"     # if you just installed Rust
cargo build --manifest-path prover/Cargo.toml
make -C attestor build
```

## Run the attestor and stub

```bash
# Terminal 1 — Telegram-shaped stub
cd attestor
./bin/zktguard-stub                       # 127.0.0.1:7676

# Terminal 2 — Attestor (uses an ephemeral key by default)
./bin/zktguard-attestor \
  --addr 127.0.0.1:7677 \
  --upstream http://127.0.0.1:7676
```

## Sanity-check the attestor

```bash
curl -s http://127.0.0.1:7677/pubkey | jq
curl -s -X POST http://127.0.0.1:7677/attest \
  -H 'content-type: application/json' \
  -d '{"path":"/account","nonce":"12345"}' | jq
```

## Build a synthetic proof

```bash
cd prover
cargo run --release -- prove \
  --input INPUT_SCHEMA.example.json \
  --output /tmp/proof.json --timed
```

## Run the Mini App

```bash
cd miniapp
pnpm dev          # http://127.0.0.1:5173
```

Open the URL, connect a TON wallet, click **Verify Telegram account
age**. If `VITE_VERIFIER_ADDRESS` points at a deployed verifier the
wallet will be prompted to sign the verify message; otherwise the
proof is just logged in the UI.

## Tests across the whole repo

```bash
pnpm test       # workspaces: contracts, sdk, miniapp, examples, circuits, docs
make -C attestor test
cargo test --manifest-path prover/Cargo.toml
```

## Testnet deployment

Pending — track in `contracts/DEPLOYMENTS.md`. The deploy scripts
already exist (`pnpm --filter @zktguard/contracts deploy:*`), they
just need a funded testnet wallet.
