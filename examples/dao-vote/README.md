# Example — dao-vote

Demonstrates: a DAO ballot whose weight depends on the holder's
zkTGuard credential. The DAO indexer dedupes ballots by nullifier;
older accounts get a bigger vote slot.

## Run

```bash
cd examples/dao-vote
pnpm install
pnpm dev
```

Environment variables are identical to `examples/quest-gate`.

## Tests

```bash
pnpm test
```
