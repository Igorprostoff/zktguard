---
id: demo
title: Five-minute demo
sidebar_position: 9
---

# Five-minute demo

Walk-through for the v0.2 Mini App against the **live testnet
deployment** (v0.2 Phase D1). No production hosting required; you run
the Mini App and the off-chain helpers locally.

> **Video.** A 90-second phone-recorded walk-through is the one
> outstanding piece of Task D5 — committed as
> `docs/static/demo.mp4` once a human records it on iOS or Android.
> This markdown is the canonical demo doc until then.

## Live testnet addresses

| Contract            | Address                                                                                              |
| ------------------- | ---------------------------------------------------------------------------------------------------- |
| Groth16Verifier     | [`kQB4g0yg…royVo9k1`](https://testnet.tonscan.org/address/kQB4g0yg0VmIQBX2Le_2ZVIE1F-k4BsXKl2Gkf3DroyVo9k1) |
| AppRegistry         | [`kQC3iKBT…wQmtqg_h`](https://testnet.tonscan.org/address/kQC3iKBTNrafHaoTFN6UwrR4LRM_-GZTosffllkhwQmtqg_h) |
| SoulboundCollection | [`kQC1TLZn…aEWIMkP9`](https://testnet.tonscan.org/address/kQC1TLZnOvkR93n4Hh3qQz0AhjvqnBJc8pKaV-J9aEWIMkP9) |

The deployer wallet and full audit trail are in
[`contracts/DEPLOYMENTS.md`](https://github.com/Igorprostoff/zktguard/blob/main/contracts/DEPLOYMENTS.md).

## Prereqs (one-time)

1. Clone the repo and install:
   ```bash
   git clone https://github.com/Igorprostoff/zktguard.git
   cd zktguard
   pnpm install
   ```
2. Fetch the proving key (~169 MB release asset; pairs with the
   committed verification key — no local trusted setup needed):
   ```bash
   bash circuits/scripts/fetch_pkey.sh
   ```
3. Bring up the off-chain stack via Docker:
   ```bash
   docker compose -f infra/docker-compose.yml up -d
   ```
   (Or `pnpm --filter @zktguard/prover-server start`, plus
   `make -C attestor stub` and `make -C attestor attestor` in separate
   terminals — same outcome, fewer containers.)
4. Fund a testnet wallet via [@testgiver_ton_bot](https://t.me/testgiver_ton_bot).
   Anything over 0.5 TON is enough for one demo run.

## The five-minute path

### 1. Open the Mini App

```bash
cp miniapp/.env.example miniapp/.env.local
pnpm --filter @zktguard/miniapp dev
```

Browse to `http://127.0.0.1:5173`.

**What you should see:** a dark card titled "zkTGuard" with the
`v0.2 Phase B — in-circuit AEAD` badge, a TON Connect button, and a
disabled **Connect a wallet first** button.

### 2. Connect a wallet

Tap the TON Connect button. Pick your testnet-funded Tonkeeper or
MyTonWallet account.

**What you should see:** the TON Connect dialog closes, the badge
flips to the connected wallet's truncated address, and the
**Verify Telegram account age** button becomes active.

### 3. Tap Verify

The Mini App calls the attestor, then the prover server, then
assembles the four-ref verifier message.

**What you should see:** the button label cycles through
`Asking the attestor…` → `Building the proof…` → `Submitting to
TON…`. The proof step takes ~10–15 s — the Phase-B circuit decrypts
the ChaCha20-Poly1305 transcript in-circuit (249 k constraints).

### 4. Sign the transaction

TON Connect pops a confirmation in your wallet. The transaction
carries the four-ref `op::verify_claim` body and ~0.5 TON for gas.

**What you should see:** a wallet confirmation prompt showing the
verifier address `kQB4g0yg…` and the 0.5 TON value. Sign it. The
wallet returns to the Mini App.

### 5. Watch the credential land

The verifier parks the proof, queries the registry, receives the
reply, records the nullifier, and sends `op::mint` to the soulbound
collection. The Mini App polls `getProofStatus` until it returns
`{ status: "minted" }`.

**What you should see:** the button label settles on
`Done — see credential below`, and a second card appears with the
nullifier and the first two G1/G2 hex blobs from the proof. The
collection's tonscan page now lists a new Item address; follow it to
confirm the soulbound token exists.

## Expected wall time

On-chain hops measured against the Phase-A deployment on 2026-05-23;
the prover row reflects the Phase-B circuit (249 k constraints,
benchmark in `prover/BENCHMARKS.md`):

| Hop                                              | Wall time |
| ------------------------------------------------ | --------- |
| Attestor TLS fetch + seal + sign                 | ~100 ms   |
| Prover server (snarkjs Groth16, Phase-B circuit) | 10–15 s   |
| Wallet sign + broadcast                          | 5–15 s (UX bound) |
| On-chain verify + park                           | 5–10 s    |
| Registry round-trip (query + reply)              | 10–15 s   |
| Mint deploy                                      | 5–10 s    |
| **Total clock time**                             | **40–70 s** |

Per-step on-chain transaction hashes from the v0.2 sanity-check run
are in `contracts/deployments/sanity-check.json`.

## Failure modes worth mentioning

- **Connection refused on /attest.** The Docker stack hasn't finished
  starting. Try `docker compose ps` and re-run.
- **Prover responds 500.** Check `WASM_PATH` and `PKEY_PATH` point at
  files that exist (the Docker compose mounts them; bare-metal runs
  need env vars set).
- **Wallet rejects with exit code 433.** The verifier wasn't wired to
  the registry. This won't happen against the live deployment unless
  the admin rotates the registry to a bad address; if it does, see
  `contracts/scripts/sanityCheckTestnet.ts` for the rewire flow.
- **`/prove` returns "circuit hash mismatch".** Re-run
  `bash circuits/scripts/fetch_pkey.sh` — it verifies the proving
  key's SHA-256 against the one that pairs with the committed VK in
  `circuits/account_age/verification_key.json` (the key the verifier
  was deployed against).

## Recording the video

90-second walk-through video, when it lands, will live at
`docs/static/demo.mp4`. Capture suggestions:

- Screen-record the Mini App side-by-side with tonscan.
- Skip the "install Telegram" step; assume the viewer has a wallet.
- Annotate the four on-chain hops as they confirm.
