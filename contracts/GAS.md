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

_Not yet built. Target measurement: gas per single-proof verification with
8 public inputs._
