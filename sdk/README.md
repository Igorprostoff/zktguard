# sdk

TypeScript SDK published as `@zktguard/sdk`. Surface is intentionally minimal: `init(config)`, `requireClaim(claim, options)`, `getCredential(user, claim)`, `verifyCredential(nullifier)`.

The SDK is a research artifact, not a stable platform API. Breaking changes between v0.x releases are expected. The reference Mini App and the `/examples` apps consume this SDK directly with no duplicated logic.

## Install

The package is not published to npm yet. Local development:

```bash
cd sdk
pnpm install
pnpm build
```

## Quickstart

```ts
import { ZktGuardClient } from "@zktguard/sdk";

const client = ZktGuardClient.init({
  network: "testnet",
  verifierAddress: "EQ...",                  // from contracts/DEPLOYMENTS.md
  attestorUrl: "http://127.0.0.1:7677",
});

const credential = await client.requireClaim("account_age", {
  appId: 1n,
  claimType: 1n,
  thresholdMonths: 6n,
  userSecret: localStorage.userSecret,
  expirationSec: BigInt(Math.floor(Date.now() / 1000)) + 3600n,
});
```

## API

| Method                              | Purpose |
| ----------------------------------- | ------- |
| `ZktGuardClient.init(config)`       | Build a client; validates VK + verifier address up-front. |
| `client.requireClaim(claim, opts)`  | Run the attestor → prover → public-inputs pipeline; returns the nullifier + synthetic proof bytes for the caller to submit via TON Connect. |
| `client.getCredential(user, claim)` | Look up an existing credential (v0 stub; will read from the Soulbound Collection when wired). |
| `client.verifyCredential(nf)`       | Query the verifier's `nullifier_used?` getter via the configured `TonClient`. |

## Tests

```bash
pnpm test
```

## Bundle size

```bash
pnpm size
```

Writes `SIZE.md` and exits non-zero if the gzipped ESM bundle exceeds the 50 KB cap.
