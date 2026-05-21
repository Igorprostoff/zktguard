---
id: examples
title: Examples
---

# Example Mini Apps

Three self-contained Mini Apps live under [`examples/`](https://github.com/Igorprostoff/zktguard/tree/main/examples). Each one uses `@zktguard/sdk` directly with no duplicated logic — only the UI copy and the post-credential payload differ.

## quest-gate

A quest reward is claimable only by wallets that hold a fresh
credential. The example shows the nullifier the on-chain quest
contract would dedupe on.

```bash
cd examples/quest-gate
pnpm dev
```

[README](https://github.com/Igorprostoff/zktguard/blob/main/examples/quest-gate/README.md)

## airdrop-gate

An airdrop claim contract distributes tokens only to wallets that
present a fresh credential. The nullifier becomes the snapshot's
de-dup key.

```bash
cd examples/airdrop-gate
pnpm dev
```

[README](https://github.com/Igorprostoff/zktguard/blob/main/examples/airdrop-gate/README.md)

## dao-vote

DAO ballot whose weight depends on account age. The DAO indexer
dedupes ballots by nullifier; older accounts get a bigger slot.

```bash
cd examples/dao-vote
pnpm dev
```

[README](https://github.com/Igorprostoff/zktguard/blob/main/examples/dao-vote/README.md)

## Adding your own

Follow `examples/quest-gate` as a template. The only zkTGuard-specific
code is in `src/App.tsx` — everything else (manifest, tonconnect
config, vite/vitest plumbing) is boilerplate.
