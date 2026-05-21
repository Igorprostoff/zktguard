# Example — airdrop-gate

Demonstrates: an airdrop claim contract distributes tokens only to
wallets that present a fresh zkTGuard credential. The credential's
nullifier becomes the de-dup key in the airdrop contract.

## Run

```bash
cd examples/airdrop-gate
pnpm install
pnpm dev
```

Environment variables are identical to `examples/quest-gate`.

## Tests

```bash
pnpm test
```
