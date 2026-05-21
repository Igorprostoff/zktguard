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
