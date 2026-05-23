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

## Try it now

This example talks to the live v0.2 Phase-D1 testnet deployment.

- Verifier: [`kQDEYarA…D9vG__O`](https://testnet.tonscan.org/address/kQDEYarAKoDzCfWckI7MhOzEqw6LLaderdpRMRVcop9vG__O)
- AppRegistry: [`kQAyi4Dt…f0APspV`](https://testnet.tonscan.org/address/kQAyi4Dt6bY-ItpA6cDJ3-vQ-3GjCKqRvTMfSfbY4f0APspV)
- SoulboundCollection: [`kQDN-5cr…dTOISty`](https://testnet.tonscan.org/address/kQDN-5crzz5jUS-O61k8RIqyoRqi26i8nDGcgT93PdTOISty)

`.env.example` pins the testnet verifier address; copy it to `.env.local` and run `pnpm dev`.
