# examples

Reference Mini Apps demonstrating SDK integration. Each example is self-contained and uses `@zktguard/sdk` directly with no duplicated logic.

Examples shipped in v0.1:

- [`quest-gate`](./quest-gate) — credential-gated quest reward
- [`airdrop-gate`](./airdrop-gate) — credential-gated airdrop claim
- [`dao-vote`](./dao-vote) — vote weight conditional on credential ownership

Each example carries its own README with a one-paragraph setup guide. The full E2E walk-through (deployed verifier + funded wallet) is documented in `contracts/DEPLOYMENTS.md` and follows the same Mini App pattern as `/miniapp`.

The three apps share a `_shared` directory holding the React component used by all of them — only the copy and the post-claim payload differ.
