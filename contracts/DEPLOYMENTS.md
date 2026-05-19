# Deployments

zkTGuard reference contracts. Testnet only for v0.

## Testnet (TON testnet, workchain 0)

| Contract       | Address | Code hash | Deploy tx | Deployed by | Date |
| -------------- | ------- | --------- | --------- | ----------- | ---- |
| PairingCheck   | _pending_ | `7016ea99...d56df91` | _pending_ | _pending_   | _pending_ |
| Verifier       | _not yet built_ | | | | |
| SoulboundNFT   | _not yet built_ | | | | |
| AppRegistry    | _not yet built_ | | | | |

### Local code hashes (built from current `main`)

| Contract     | Full code hash |
| ------------ | -------------- |
| PairingCheck | `7016ea99856c704cfc5956909890b4de5f702d9b033bb138918535099d56df91` |

Reproduce locally with `pnpm build --filter @zktguard/contracts`. The hash
appears in `contracts/build/PairingCheck.compiled.json` under `hash`.

## Mainnet

Not deployed. v0 is testnet only.

## Reproducing a deployment

```
cd contracts
pnpm install
pnpm deploy:pairing  # follow Blueprint prompts: pick testnet, supply wallet
```

The deploy script prints the deployed address. Update the table above on
each new deployment. Older addresses remain valid; do not delete rows.
