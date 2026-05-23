# miniapp/e2e

Playwright end-to-end suite for the v0.2 testnet deployment. Drives
the live Mini App with a sandbox wallet stub (`./wallet-stub`) so
runs are deterministic and unattended.

## Scope

Four scenarios:

| Spec                                        | Asserts                                       | Wall budget |
| ------------------------------------------- | --------------------------------------------- | ----------- |
| `specs/happy-path.spec.ts`                  | Connect, prove, mint, nullifier recorded      | ≤ 90 s |
| `specs/expired-proof.spec.ts`               | Verifier rejects with exit 403                | ≤ 60 s |
| `specs/replayed-nullifier.spec.ts`          | First mint succeeds, second exits 402 on reply | ≤ 180 s |
| `specs/unregistered-app.spec.ts`            | Verifier parks, registry returns false, no mint | ≤ 120 s |

Total: ≤ 7.5 min if all green. Hard ceiling: 10 min.

## Run locally

```bash
# 1. Provide the test wallet seed (testnet only!)
cp miniapp/e2e/wallet-stub/test-wallet.env.example miniapp/e2e/wallet-stub/.env
$EDITOR miniapp/e2e/wallet-stub/.env

# 2. Install Playwright browsers (once)
pnpm exec playwright install --with-deps chromium

# 3. Run the suite. The `webServer` config starts Vite automatically.
export $(grep -v '^#' miniapp/e2e/wallet-stub/.env | xargs)
pnpm --filter @zktguard/miniapp test:e2e
```

Without `WALLET_STUB_MNEMONIC` the suite skips with a clear message
rather than failing. CI sets the same env var from the `test`
environment secret.

## Run in CI

The `.github/workflows/e2e-testnet.yml` workflow runs on pushes to
`main` and tag pushes. It is non-blocking for PRs (testnet flakiness
+ rate limits) but blocks release tagging.

## Wallet stub vs. real Tonkeeper

We use a stub because:

1. Tonkeeper requires human approval; deterministic CI cannot drive it.
2. The stub signs transactions with the same `@ton/crypto` keypair a
   real wallet would, so signature semantics are exercised.
3. The stub never opens a UI, so test runs are headless and fast.

The injection mechanism is `window.__TONCONNECT_TEST_STUB__`. The
Mini App's `src/connect.ts` reads it at module init time and routes
the wallet hooks through it if present. Without the global, the
Mini App uses `@tonconnect/ui-react` normally.

## Rate limits

The free-tier toncenter testnet RPC is ~1 RPS. The stub and the
tests both route writes through `contracts/lib/throttle.ts`. With a
paid API key, the rate delays can be reduced by setting
`RATE_DELAY_MS` in the environment.

## Debugging failures

- HTML report: `playwright-report/index.html` after a failed run.
- Trace viewer: `pnpm exec playwright show-trace test-results/.../trace.zip`.
- Video on failure: enabled in `playwright.config.ts` (`video: "retain-on-failure"`).
- Re-run a single spec: `pnpm --filter @zktguard/miniapp test:e2e -- specs/happy-path.spec.ts`.

## Adding a new scenario

1. Add `specs/your-scenario.spec.ts`. Use the `e2eTest` fixture
   from `fixtures.ts` so the wallet stub is provisioned for you.
2. Update this README's scope table and the `architecture.md`
   section in `docs/`.
3. Confirm the scenario passes three times in a row before merging.

## Known limits

- The Mini App displays the **nullifier** as the credential
  identifier rather than the soulbound NFT's contract address.
  The Item address depends on the collection's `next_index` and the
  verifier's `now()` at reply time, both unknowable client-side. The
  happy-path test asserts mint completion via the verifier's
  `nullifier_used?` getter instead of looking up the Item contract.
  Tracked as a v0.3 follow-up.
- Workers=1. The throttle helper plus sequential tests dominate the
  wall-clock; parallel runs would race each other on toncenter's
  free tier.
