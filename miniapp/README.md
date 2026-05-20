# miniapp

Reference Telegram Mini App, built with React + Vite and deployed as a static site. Demonstrates the end-to-end flow: connect a TON wallet, ask the attestor for a signed transcript, build a Groth16 proof, and submit the verify message to the on-chain verifier.

## Quickstart

```bash
cd miniapp
pnpm install
pnpm dev           # http://127.0.0.1:5173
```

For the wallet flow to function you also need:

```bash
# In two other terminals:
cd attestor && make stub && ./bin/zktguard-stub        # 127.0.0.1:7676
cd attestor && make attestor && ./bin/zktguard-attestor # 127.0.0.1:7677
```

## Environment

| Variable                       | Default                                                  | Notes |
| ------------------------------ | -------------------------------------------------------- | ----- |
| `VITE_NETWORK`                 | `testnet`                                                | `testnet`/`mainnet`/`sandbox` |
| `VITE_VERIFIER_ADDRESS`        | a placeholder (will throw on real submission)            | Replace with the address from `contracts/DEPLOYMENTS.md` after Task 4 is deployed |
| `VITE_ATTESTOR_URL`            | `http://127.0.0.1:7677`                                  | Local attestor base URL |
| `VITE_TONCONNECT_MANIFEST_URL` | `https://example.com/tonconnect-manifest.json`           | Hosted manifest; `public/tonconnect-manifest.json` is the local source of truth |

## Telegram setup

1. Talk to [@BotFather](https://t.me/BotFather) and create a new bot.
2. Run `/newapp`, point the Mini App URL at `https://your-host/`, attach the icon, and confirm.
3. Set `VITE_TONCONNECT_MANIFEST_URL` to the same host so wallets see the right manifest.

## Tests

```bash
pnpm test         # vitest, jsdom, runs in <1 s
```

`test/flow.spec.ts` exercises the attestor + prover pipeline against the placeholder VK using a mocked `fetch` and a mocked `tonConnectUI.sendTransaction`. No real network is touched.

## Playwright (deferred)

Bible Task 9 calls for a Playwright E2E run against TON testnet. That requires a funded testnet wallet and a deployed verifier — both `_pending_` in `contracts/DEPLOYMENTS.md`. The Playwright skeleton will live in `test/e2e/` once the deploy story closes.
