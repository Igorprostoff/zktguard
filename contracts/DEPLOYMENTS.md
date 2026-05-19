# Deployments

zkTGuard reference contracts. Testnet only for v0.

## Testnet (TON testnet, workchain 0)

| Contract        | Address | Code hash | Deploy tx | Deployed by | Date |
| --------------- | ------- | --------- | --------- | ----------- | ---- |
| PairingCheck    | _pending_ | `7016ea99...d56df91` | _pending_ | _pending_   | _pending_ |
| Groth16Verifier | _pending_ | `55633434...0fa5b0b40` | _pending_ | _pending_   | _pending_ |
| SoulboundNFT    | _not yet built_ | | | | |
| AppRegistry     | _not yet built_ | | | | |

### Local code hashes (built from current `main`)

| Contract        | Full code hash |
| --------------- | -------------- |
| PairingCheck    | `7016ea99856c704cfc5956909890b4de5f702d9b033bb138918535099d56df91` |
| Groth16Verifier | `556334348f7a1d0eb8d79f611c5fb1547a04e9e9f87ecd120c96a100fa5b0b40` |

> The Groth16Verifier code hash will change once the placeholder VK is
> replaced with the real verification key produced by Task 3.

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
