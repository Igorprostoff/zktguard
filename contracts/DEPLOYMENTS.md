# Deployments

zkTGuard reference contracts. Testnet only for v0.

## Testnet (TON testnet, workchain 0)

| Contract             | Address | Code hash | Deploy tx | Deployed by | Date |
| -------------------- | ------- | --------- | --------- | ----------- | ---- |
| PairingCheck         | _pending_ | `7016ea99...d56df91` | _pending_ | _pending_   | _pending_ |
| Groth16Verifier      | _pending_ | `55633434...0fa5b0b40` | _pending_ | _pending_   | _pending_ |
| SoulboundCollection  | _pending_ | `cccb1db2...1dc8754`  | _pending_ | _pending_   | _pending_ |
| SoulboundItem (code) | n/a       | `ed91dc9c...ede3c36`  | embedded in Collection | n/a | n/a |
| AppRegistry          | _pending_ | `edb7105b...678af074`  | _pending_ | _pending_   | _pending_ |

### Local code hashes (built from current `main`)

| Contract             | Full code hash |
| -------------------- | -------------- |
| PairingCheck         | `7016ea99856c704cfc5956909890b4de5f702d9b033bb138918535099d56df91` |
| Groth16Verifier      | `556334348f7a1d0eb8d79f611c5fb1547a04e9e9f87ecd120c96a100fa5b0b40` |
| SoulboundCollection  | `cccb1db2e2272ab39cdef0c976685fb1d2b0873fd7cc2038df15e6de21dc8754` |
| SoulboundItem        | `ed91dc9c8aac2cb7c8dfd34a5442955aa2a9f8221ef2539ea16bb4999ede3c36` |
| AppRegistry          | `edb7105b39cebe1dfcfb2811571f10e30ea983367b78238e2df80b0c678af074` |

> The Groth16Verifier code hash will change once the placeholder VK is
> replaced with the real verification key produced by Task 3. The
> SoulboundCollection code hash embeds the SoulboundItem code as a ref;
> both must be rebuilt together.

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
