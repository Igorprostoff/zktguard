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

- Verifier: [`kQB4g0yg…royVo9k1`](https://testnet.tonscan.org/address/kQB4g0yg0VmIQBX2Le_2ZVIE1F-k4BsXKl2Gkf3DroyVo9k1)
- AppRegistry: [`kQC3iKBT…wQmtqg_h`](https://testnet.tonscan.org/address/kQC3iKBTNrafHaoTFN6UwrR4LRM_-GZTosffllkhwQmtqg_h)
- SoulboundCollection: [`kQC1TLZn…aEWIMkP9`](https://testnet.tonscan.org/address/kQC1TLZnOvkR93n4Hh3qQz0AhjvqnBJc8pKaV-J9aEWIMkP9)

`.env.example` pins the testnet verifier address; copy it to `.env.local` and run `pnpm dev`.
