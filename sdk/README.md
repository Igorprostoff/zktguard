# sdk

TypeScript SDK published as `@zktguard/sdk`. Surface is intentionally minimal: `init(config)`, `requireClaim(claim, options)`, `getCredential(user, claim)`, `verifyCredential(nullifier)`.

The SDK is a research artifact, not a stable platform API. Breaking changes between v0.x releases are expected. The reference Mini App and the `/examples` apps consume this SDK directly with no duplicated logic.
