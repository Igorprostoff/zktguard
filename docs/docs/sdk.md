---
id: sdk
title: SDK reference
---

# `@zktguard/sdk`

TypeScript client for zkTGuard. Source: [`sdk/src/index.ts`](https://github.com/Igorprostoff/zktguard/blob/main/sdk/src/index.ts).

## Install

The package is not published to npm yet. Use the workspace symlink
inside the repo or copy the source into your project.

## `ZktGuardClient`

### `init(config: ZktGuardConfig): ZktGuardClient`

Builds a client. Throws on misconfigured `vk.ic.length` or invalid
verifier address.

```ts
import { ZktGuardClient } from "@zktguard/sdk";

const client = ZktGuardClient.init({
  network: "testnet",
  verifierAddress: "EQ…",
  attestorUrl: "http://127.0.0.1:7677",
});
```

### `client.requireClaim(claim: string, options: ClaimOptions): Promise<Credential>`

Runs the attestor + prover pipeline. Returns the nullifier and the
synthetic proof bytes the wallet payload uses.

```ts
const credential = await client.requireClaim("account_age", {
  appId: 1n,
  claimType: 1n,
  thresholdMonths: 6n,
  userSecret: localStorage.userSecret,
  expirationSec: BigInt(Math.floor(Date.now() / 1000)) + 3600n,
});
```

### `client.getCredential(user, claim): Promise<Credential | null>`

v0 stub. Will read from the Soulbound Collection once cross-contract
send is wired (Task 4 follow-up).

### `client.verifyCredential(nullifier: bigint): Promise<boolean>`

Calls the verifier's `nullifier_used?` getter via the configured
`TonClient`. Throws if `tonClient` was not supplied to `init`.

## Helpers

| Symbol                          | Purpose |
| ------------------------------- | ------- |
| `craftSyntheticProof`           | Pure JS proof crafter against any VK + public-input vector. |
| `buildVerifierMessageBody`      | Builds the 4-ref cell body the FunC verifier reads.         |
| `derivePlaceholderNullifier`    | Deterministic nullifier — same shape as Poseidon will use.  |
| `packNonce(chainId, random)`    | Packs `chain_id` into the high 32 bits of `nonce`.          |
| `OP_CODES`                      | `{ verifyClaim: 0x76657266 }`.                              |

## Bundle size

```bash
pnpm --filter @zktguard/sdk size
```

Writes `sdk/SIZE.md`. Current gzipped ESM bundle is well under the 50 KB cap.
