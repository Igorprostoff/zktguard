# infra

Local-dev convenience only. zkTGuard is a research artifact — no
hosted services, no managed infrastructure, no cloud target. This
folder exists so contributors can stand up the full off-chain stack
(attestor, prover-server, Telegram-shaped stub) on their own machine
with a single command.

## Run

```bash
# 1. Build the proving key + VK once.
bash ../circuits/scripts/install_circom.sh   # if circom not on PATH
bash ../circuits/scripts/setup.sh

# 2. Stand up the stack.
docker compose up
```

Endpoints, on localhost:

| Service           | URL                          |
| ----------------- | ---------------------------- |
| Telegram stub     | http://127.0.0.1:7676/account |
| Attestor          | http://127.0.0.1:7677         |
| Prover server     | http://127.0.0.1:7679         |

Point the Mini App at these via env vars:

```bash
VITE_ATTESTOR_URL=http://127.0.0.1:7677 \
VITE_PROVER_URL=http://127.0.0.1:7679 \
pnpm --filter @zktguard/miniapp dev
```

## What this does **not** include

- No deploy target (Render, Fly.io, AWS, GCP, etc.). zkTGuard does
  not operate hosted services.
- No TLS termination. The stack listens on plaintext loopback.
- No metrics / logs / telemetry beyond the services' own stderr.
- No production-grade key management. The attestor key is generated
  fresh on first run and lives in the `attestor-keys` Docker volume.
