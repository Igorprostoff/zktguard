# Deployments

zkTGuard reference contracts. Testnet only — mainnet is intentionally
out of scope through at least v0.2.

## v0.2 Phase B testnet deployment (current)

Redeploy with the Phase-B verification key (in-circuit
ChaCha20-Poly1305, 249 346 constraints). Fresh instances of all three
contracts; the Phase-A deployment below remains on chain but is
retired. Deployed from CI via the `deploy-testnet` workflow
(run 29636614420). Record: `contracts/deployments/v0.2-testnet.json`.

- Deployer wallet (v5R1): `kQDsSjXW6c72u4OFePCVWMTxGebuxfrvgrWsXlpFwQrGQihc`
  (the e2e stub wallet; it is the admin of all three contracts)
- Network: TON testnet (`https://testnet.toncenter.com`)
- Date: 2026-07-18

### Contracts

| Contract            | Address                                                              | Deploy tx |
| ------------------- | -------------------------------------------------------------------- | --------- |
| AppRegistry         | `kQC3iKBTNrafHaoTFN6UwrR4LRM_-GZTosffllkhwQmtqg_h` | `d0d8e3682b718d021ff8b1ea4f73054f8c42f7870c62de450103f10b6757b6be` |
| SoulboundCollection | `kQC1TLZnOvkR93n4Hh3qQz0AhjvqnBJc8pKaV-J9aEWIMkP9` | `d33a7640b566dbb4f626b2d015f8fe6903fbd6fa299b927d5553245ea75b7c33` |
| Groth16Verifier     | `kQB4g0yg0VmIQBX2Le_2ZVIE1F-k4BsXKl2Gkf3DroyVo9k1` | `96168298a098543dad56bcc27bd8498546cc46eacb88cd77b75eb733c735fa0f` |

### Wiring transactions

| Op                                | Tx hash |
| --------------------------------- | ------- |
| `op::set_collection` on verifier  | `40d0212f8bceb507a889e42c01d15bf1a99578f0a4e142cce86ae93c1304f6b0` |
| `op::set_registry` on verifier    | `105846f132a7a736d5dfe03c62fd8664a82ac10a1a7cdabd90b819456aa9c905` |
| `op::set_verifier` on collection  | `6ec457b5f4c329b5304d13625479938a91680a5dfb5d15fbeacc6dc47f53e2d0` |
| `op::register (app_id=1, claim_type=1)` on registry | `267ecd83c58695176319b9b535bb4da0d83c2978d34a89459661266fcde77d45` |

## v0.2 Phase A testnet deployment (superseded 2026-07-18)

Live deployment of v0.2 to the public TON testnet (workchain 0). All
addresses are bounceable, testnet-only (`kQ…` prefix). Deployment
record: `contracts/deployments/v0.2-testnet.json`.

- Deployer wallet (v5R1): `kQBEhiWNej5aCTLMVnDxRC8esUz423bqhlUdj3hmDWFMMXUS`
- Source commit: `ebc5caf87d8156aa78e96d91012e20ff5f9f0114`
- Network: TON testnet (`https://testnet.toncenter.com`)
- Date: 2026-05-23

The admin role for all three contracts is held by the deployer
wallet. v1.0 (out of scope here) would rotate this to a multisig per
the bible's "no central operator" framing; v0.2 keeps it on the
single wallet to allow demo iteration without a governance dance.

### Contracts

| Contract            | Address                                                              | Deploy tx                                                              | Explorer |
| ------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------- | -------- |
| AppRegistry         | `kQAyi4Dt6bY-ItpA6cDJ3-vQ-3GjCKqRvTMfSfbY4f0APspV`                    | `add2d5941f3cd77f7a84987b58403569ae3779f080d2db047b1a16d01d0ae7d2`     | [tonscan](https://testnet.tonscan.org/address/kQAyi4Dt6bY-ItpA6cDJ3-vQ-3GjCKqRvTMfSfbY4f0APspV) |
| SoulboundCollection | `kQDN-5crzz5jUS-O61k8RIqyoRqi26i8nDGcgT93PdTOISty`                    | `d119faa5ddf0d9d6f6ba124a3bfe9a56c15cc97e74613dc97416b9ff4a7db79f`     | [tonscan](https://testnet.tonscan.org/address/kQDN-5crzz5jUS-O61k8RIqyoRqi26i8nDGcgT93PdTOISty) |
| Groth16Verifier     | `kQDEYarAKoDzCfWckI7MhOzEqw6LLaderdpRMRVcop9vG__O`                    | `ddd8e2f746a3357c00dc6efefe5d8160684692fddca2af2defd3f5aaf89ae842`     | [tonscan](https://testnet.tonscan.org/address/kQDEYarAKoDzCfWckI7MhOzEqw6LLaderdpRMRVcop9vG__O) |

### Wiring transactions

| Op                                | From → To           | Tx hash                                                              |
| --------------------------------- | ------------------- | -------------------------------------------------------------------- |
| `op::set_collection` on verifier  | deployer → verifier | `fa1888d125b3b58daa982bb3a910755e7f10d82b75c8ebebd4a98d5b4f2ddaa1`   |
| `op::set_registry` on verifier    | deployer → verifier | `ef1242f0ffd32fa108126a29de68b19606dc6cb626d74fcf9cdc6fdeefdac4d8`   |
| `op::set_verifier` on collection  | deployer → collection | `1f2db0b4345bbbafc54282ac18ba88b8fc54d6f85275d7a50b5e44f2b9570735` |
| `op::register (app_id=1, claim_type=1)` on registry | deployer → registry | `1f6cac2ec5466110caad637ca5133967ebebc710a5c0bf8127f8cd97b9c62eba` |

The two verifier wiring ops are audit-trail-only: the verifier was
deployed with both addresses already in its stateInit data. Re-sending
them confirms the admin path is functional on chain and gives the
release a single canonical pre-mint state.

### End-to-end sanity check

A real Phase-A proof was submitted against the deployed verifier
through the four-message async sequence. All hops landed on chain.

| Hop                | Tx hash                                                              |
| ------------------ | -------------------------------------------------------------------- |
| `op::verify_claim` | `3039fdf800bc62ad88eb4b2770cfabe2b68ba0ee57ef57b33302ebd3e9cc6022`   |
| `op::query_registered` (verifier → registry) | `9774420f4256c505dcc474ef5ba4a8b98d9867a42e670e744bb24dab6626f000` |
| `op::query_reply` (registry → verifier)      | `695586950efed1b8484f47d13e049e87c662196eb38751b2be6415271645b474` |
| `op::mint` (verifier → collection)           | `077496a2b366536912afb81a4fae4bbaafb1c25747561e2f105456c8ff3d4547` |

After the mint, the verifier's `nullifier_used?` getter returned
`true` for nullifier
`0x2d55357cc9ee7d60f2efabe948b19e0d8b156d93a419542b56da95b6b33b32ed`
(the same Poseidon output as the sandbox fixture, expected because
the proof was generated against the same Phase-A circuit).

## Local code hashes (built from current `main`)

These are the FunC cell hashes embedded in each `*.compiled.json`
under the `hash` field. They identify the on-chain code regardless of
the JSON wrapper's surrounding bytes.

| Contract            | Cell hash |
| ------------------- | --------- |
| PairingCheck        | `7016ea99856c704cfc5956909890b4de5f702d9b033bb138918535099d56df91` |
| Groth16Verifier     | `c0fcb432d0f3719b5c11fe5f0313e3e24ab1fb297f6df60d24c383f4ec9a571f` |
| SoulboundCollection | `6dc6f3adf6bf2292cb635cbcc767d5f79b2d146ac4e02dad3c6739cea3138087` |
| SoulboundItem       | `ed91dc9c8aac2cb7c8dfd34a5442955aa2a9f8221ef2539ea16bb4999ede3c36` |
| AppRegistry         | `b31bc56cc5d3f717f026bc881346845195a58e1c617d06214fb8bbc72a1687a3` |

Reproduce locally with `pnpm --filter @zktguard/contracts build`; the
hash appears in `contracts/build/<Contract>.compiled.json` under
`hash`. Note that the JSON-wrapper sha256 in `REPRODUCE.md` is more
brittle than these cell hashes — JSON formatting drifts across
Blueprint versions while the cell hash stays put.

## Reproducing a deployment

```
cd contracts
pnpm install
pnpm exec ts-node scripts/deployTestnet.ts
```

Requires `WALLET_MNEMONIC` in the environment (24-word testnet
mnemonic; `WALLET_VERSION=v5R1` for this deployer). The script writes
a new entry to `contracts/deployments/`. Update this file's tables on
each fresh deployment; older addresses remain valid as historical
records.

## Mainnet

Not deployed. v0.2 is testnet only.
