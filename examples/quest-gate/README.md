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

- Verifier: [`kQB4g0yg…royVo9k1`](https://testnet.tonscan.org/address/kQB4g0yg0VmIQBX2Le_2ZVIE1F-k4BsXKl2Gkf3DroyVo9k1)
- AppRegistry: [`kQC3iKBT…wQmtqg_h`](https://testnet.tonscan.org/address/kQC3iKBTNrafHaoTFN6UwrR4LRM_-GZTosffllkhwQmtqg_h)
- SoulboundCollection: [`kQC1TLZn…aEWIMkP9`](https://testnet.tonscan.org/address/kQC1TLZnOvkR93n4Hh3qQz0AhjvqnBJc8pKaV-J9aEWIMkP9)

`.env.example` pins the testnet verifier address; copy it to `.env.local` and run `pnpm dev`.
