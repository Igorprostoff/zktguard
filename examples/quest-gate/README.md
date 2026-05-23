# Example — quest-gate

Demonstrates: a quest reward is claimable only by wallets that hold a
zkTGuard credential. The example calls the SDK's `requireClaim`, then
shows the nullifier the on-chain quest contract would check.

## Run

```bash
cd examples/quest-gate
pnpm install
pnpm dev    # http://127.0.0.1:5173
```

## Environment

| Variable                       | Default                                                  |
| ------------------------------ | -------------------------------------------------------- |
| `VITE_NETWORK`                 | `testnet`                                                |
| `VITE_VERIFIER_ADDRESS`        | placeholder; update once Task 4 is deployed              |
| `VITE_ATTESTOR_URL`            | `http://127.0.0.1:7677`                                  |
| `VITE_TONCONNECT_MANIFEST_URL` | `https://example.com/tonconnect-manifest.json`           |

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
