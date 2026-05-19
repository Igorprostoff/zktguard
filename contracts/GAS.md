# Gas measurements

All numbers are TVM gas units. Sandbox values come from
`@ton/sandbox` and approximate testnet usage to within a few units.
On-chain values are pulled from `tonscan.org` after each testnet deploy.

## PairingCheck

| Path | Sandbox gas | Testnet gas | Notes |
| ---- | ----------- | ----------- | ----- |
| `check_pairing` known-good (`e(aG1, bG2) == e(abG1, G2)`) | 62 741 | _pending deploy_ | dominated by `BLS_PAIRING` over 2 pairs |
| `check_pairing` known-bad (`e(G1, G2) != e(G1, 2G2)`) | 62 625 | _pending deploy_ | same opcode mix, different result bit |
| malformed point → exit 901 | _aborts in input parse_ | _pending deploy_ | does not reach pairing opcode |

Numbers above are TVM gas units reported by `@ton/sandbox` (v0.32) on
`@ton/core` 0.62, recorded by the `[gas]` lines in `tests/PairingCheck.spec.ts`.
On-chain numbers go in once the contract is deployed and exercised on testnet.

Fill measured numbers in by running:

```
cd contracts
pnpm test    # prints "GAS known-good" / "GAS known-bad"
```

Or by inspecting the trace after a testnet send.

## Verifier (Groth16)

| Path | Sandbox gas | Testnet gas | Notes |
| ---- | ----------- | ----------- | ----- |
| `verify_claim` accept (4-pair pairing + 9-term multiexp on placeholder VK) | 148 881 | _pending deploy_ | dominated by `BLS_PAIRING` (4 pairs) + two `BLS_G1_MULTIEXP` (4 + 5 terms) joined by `BLS_G1_ADD` |
| `verify_claim` reject 401 (flipped C sign bit) | _measured below_ | _pending deploy_ | full pairing path runs before mismatch |
| `verify_claim` reject 402 (replayed nullifier) | _negligible_ | _pending deploy_ | dict lookup, aborts before pairing |
| `verify_claim` reject 403 (expired) | _negligible_ | _pending deploy_ | timestamp compare, aborts before pairing |
| `verify_claim` reject 404 (unknown app_id) | _negligible_ | _pending deploy_ | constant compare, aborts before pairing |
| `verify_claim` reject 405 (chain mismatch) | _negligible_ | _pending deploy_ | first check, aborts immediately |

Accept-path number recorded from sandbox; the cheap-reject branches are
not yet instrumented but each aborts before reaching the pairing
opcode, so their gas is bounded by the dict lookup at ~10 k.
