# Changelog

All notable changes are recorded here. The format roughly follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions
follow SemVer.

## [Unreleased]

### v0.2 Phase B — ChaCha20-Poly1305 verified inside the circuit

**AES-GCM TLS sessions are no longer supported.** The circuit verifies
ChaCha20-Poly1305 and only ChaCha20-Poly1305; the attestor emits only
that AEAD.

The v0.1 AEAD / transcript / timestamp stubs are replaced with real
Circom bodies (Tasks B2–B5):

- `ChaCha20(numBlocks)` — bit-sliced RFC 8439 stream cipher.
  23 452 constraints per 64-byte block on BLS12-381; six RFC vectors.
- `Poly1305(maxMessageBytes)` — five-limb 26-bit accumulator, lazy
  reduction mod `2^130 − 5`, thermometer length selector. RFC §2.5.2
  and boundary-length vectors; cross-checked against OpenSSL.
- `ChaCha20Poly1305Decrypt(maxCT, maxAAD)` — RFC §2.8 AEAD; tag
  mismatch or ciphertext tamper fails witness generation. RFC §2.8.2
  vector plus OpenSSL roundtrips.
- `account_age/circuit.circom` now decrypts the transcript, extracts
  `"created_at"` at a witnessed offset (`JsonTimestampExtract`), and
  commits the session with `TranscriptCommitment`. Full circuit:
  **249 346 constraints** (target ≤ 1 M). `params.json` sets the
  512-byte ciphertext / 16-byte AAD sizing. Trusted-setup PoT capacity
  raised 2^14 → 2^19; VK regenerated.

Attestor and stub (Tasks B6, B7):

- The attestor fetches the upstream over **TLS 1.3** and seals the
  body with ChaCha20-Poly1305 under a key from the RFC 5705 session
  exporter (fresh per-seal salt ⇒ no keystream reuse across kept-alive
  connections). It signs a Poseidon commitment over the sealing. The
  `/attest` response schema changed to the sealing tuple; **v0.1
  clients break**, as the DoD permits.
- Go's `crypto/tls` exposes neither TLS 1.3 record keys nor
  cipher-suite selection, so the "ChaCha20-Poly1305 only" constraint
  is enforced by the attestor emitting only that AEAD, not by the
  negotiated record suite. Rationale in `attestor/internal/session`
  and the attestor README.
- `zktguard-stub` terminates TLS 1.3 with a self-signed cert
  (`scripts/gen_stub_cert.sh`, gitignored); attestor reaches it with
  `--insecure-skip-verify`.

Wiring and docs:

- SDK `requireClaim` posts to `/attest`, decodes the sealing, and
  builds the new private witness (`tls_key`, `tls_nonce`,
  `ciphertext`, `aad`, `tag`, `timestamp_offset`). `creationTimestamp`
  is deprecated — the circuit now derives it.
- `pnpm test:integration:phase-b` runs stub → attestor → prover →
  verify with a real (non-synthetic) proof
  (`scripts/integration_phase_b.mjs`).
- `paper/zktguard.tex` Construction section describes the real AEAD
  verification and the honest trust boundary.
- `circom_tester` bumped to 0.0.24 and patched for the circom 2.2
  `runtime.printDebug` wasm import.

Deferred to v0.3: in-circuit verification of the attestor's
EdDSA-BabyJubjub signature (cross-field BN254↔BLS12-381; the signature
is checked off-circuit in v0.2).

### v0.2 Phase D4 closure — three consecutive green e2e runs

D4 DoD satisfied on 2026-06-02: three consecutive `e2e-testnet`
workflow runs (26838532014, 26838809264, 26839087733) each returned
4/4 in ≈ 2.1 minutes. The only remaining v0.2 work is Phase B.

Infrastructure fixes applied during the D4 debug cycle (post-PR #26):
- `listFresh` in `miniapp/e2e/lib/chain.ts` now calls
  `getTransactions` without a lt/hash cursor. The old approach
  anchored to `getContractState.lastTransaction`; when toncenter
  cached that state between the parking-tx and the registry-reply
  tx the spec never saw the reply. Cursor-free matches what the
  diagnostic script uses.
- `listFreshSafe` wraps the polling loop so a sustained toncenter
  5xx wave returns `[]` instead of propagating "retries exhausted".
- `RETRY_BACKOFF_MS` capped at 2000 ms (was 5000) so one 500 wave
  costs ≤ 62 s instead of 155 s, fitting inside any spec budget.
- `retries: 1` in playwright config to auto-retry on transient
  outages.
- `WalletStub.ensureBalance` fails fast with a clear message and
  faucet URL when the stub wallet drops below 3 TON.

### v0.2 Phase D — testnet deployment

zkTGuard v0.2 is now live on **TON testnet**. The three contracts
were deployed in order (registry → collection → verifier), wired via
the admin ops, and an end-to-end verify-claim was sent through the
full async sequence.

- AppRegistry: `kQAyi4Dt6bY-ItpA6cDJ3-vQ-3GjCKqRvTMfSfbY4f0APspV`
- SoulboundCollection: `kQDN-5crzz5jUS-O61k8RIqyoRqi26i8nDGcgT93PdTOISty`
- Groth16Verifier: `kQDEYarAKoDzCfWckI7MhOzEqw6LLaderdpRMRVcop9vG__O`

Wiring transactions:

- `op::set_collection` on verifier: `fa1888d1…`
- `op::set_registry` on verifier:   `ef1242f0…`
- `op::set_verifier` on collection: `1f2db0b4…`
- `op::register(1, 1)` on registry: `1f6cac2e…`

End-to-end sanity check transaction hashes:

- `op::verify_claim`:    `3039fdf8…`
- `op::query_registered`: `9774420f…`
- `op::query_reply`:     `69558695…`
- `op::mint`:            `077496a2…`

Full audit trail and tonscan links live in
`contracts/DEPLOYMENTS.md`. The deployer wallet's seed never enters
the repo (it lives in `.env.local`, gitignored). The deployer wallet
is the admin for all three contracts; v1.0 would rotate this to a
multisig.

- `contracts/scripts/deployTestnet.ts` is the bespoke deploy driver
  (Blueprint's CLI v0.27 hits a Node-24 `Dirent.path` regression and
  can't enumerate scripts; the driver loads the wallet directly via
  `@ton/ton` + `@ton/crypto` and emits the same artefacts).
- `contracts/scripts/sanityCheckTestnet.ts` re-uses the Phase-A proof
  fixture to drive the async flow end-to-end and writes a
  per-hop tx-hash JSON.
- `contracts/deployments/v0.2-testnet.json` and
  `contracts/deployments/sanity-check.json` are the canonical
  machine-readable records.

D3, D5, D6 closing pieces:

- `miniapp/.env.example` + each `examples/*/.env.example` ship pinned
  to the testnet verifier. Default-verifier strings in the React
  apps also point at the live address.
- `docs/demo.md` rewritten against the live deployment. Adds a "What
  you should see" line for each step and a measured wall-clock
  table. Video is the only remaining D5 piece — recorded by hand on
  a phone post-release.
- `paper/zktguard.tex` Evaluation table now shows the four testnet
  tx hashes; Limitations retires the placeholder-VK caveat and
  acknowledges the single-party Phase-2 as the new standing
  limitation.

### v0.2 Phase D4 — Playwright e2e against testnet

- New workspace `miniapp/e2e/wallet-stub/` implements the TON Connect
  2.0 subset the Mini App reads, signs with a hardcoded testnet seed,
  and broadcasts via the shared `contracts/lib/throttle` wrapper. The
  Mini App's `src/connect.ts` routes through the stub when the page
  installs `window.__TONCONNECT_TEST_STUB__`.
- Page object + fixture pair in `miniapp/e2e/` derive a per-test
  `user_secret` from the spec title plus a per-run salt, and expose a
  page-side claim-options override hook that `flow.ts` reads so the
  Mini App emits a unique nullifier per scenario.
- Four scenarios on the live D1 deployment:
  - `happy-path.spec.ts` — connect, verify, mint, `nullifier_used?`
    becomes true within budget (≤ 90 s).
  - `expired-proof.spec.ts` — tampered `expiration` triggers exit
    403 before the pairing check; no parked entry (≤ 60 s).
  - `replayed-nullifier.spec.ts` — second submission of the same
    Poseidon hash rejected with exit 402 on the registry reply;
    sacrificed `user_secret` documented in the spec (≤ 180 s).
  - `unregistered-app.spec.ts` — verifier parks, registry replies
    `is_registered=false`, parked entry dropped, no mint (≤ 120 s).
- New CI workflow `.github/workflows/e2e-testnet.yml` runs the suite
  on pushes to `main`, on `v*` tag pushes, and on manual dispatch.
  `environment: test` exposes `WALLET_STUB_MNEMONIC`; a defensive
  guard fails loudly if the secret is empty. Workflow is the release
  gate per `CONTRIBUTING.md`.
- `contracts/lib/throttle.ts` now reads `RATE_DELAY_MS`,
  `RETRY_BACKOFF_MS`, and `MAX_RETRIES` at call time so the
  wallet-stub vitest can mutate the limits between cases.

### v0.2 known deferrals after Phase D

- Phase B implementation (B2–B7): in-circuit ChaCha20-Poly1305 is
  still a multi-day engineering effort.
- Task D5 — the 90-second video. Needs a human + phone.
- v0.2 release tag. Pending B implementation.

### v0.2 Phase A — remote prover server (Task A5 closing piece)

- New workspace `prover/server` ships `zktguard-prover-server`, a
  Node HTTP wrapper around `snarkjs.groth16.fullProve`. Listens on
  `127.0.0.1:7679` by default. Endpoints `/health` and `POST /prove`.
  Tests via `node --test` (tsx).
- SDK's `requireClaim` already posts to `proverUrl`; the server is
  the missing peer.

### v0.2 Phase C — SDK status + design doc (Tasks C1, C7 closing pieces)

- `contracts/design/async-flow.md` documents the four-message
  verifier→registry→verifier→collection sequence, the parked-proof
  state machine, bounce handling, gas budgets, and failure modes.
  Linked from the Docusaurus architecture page.
- SDK gains `getProofStatus(queryId, nullifier)` returning
  `{ status: "parked" | "minted" | "rejected" | "expired" }` and a
  `waitForMint()` polling helper. `getCredential` documented as a
  v0.3 stub (the collection lacks an owner→item index on chain).

### v0.2 Phase D — Docker compose + demo doc (Tasks D2, D5)

- New `infra/docker-compose.yml` stands up the off-chain stack (stub
  + attestor + prover-server) on host network with proper bind mounts.
- `docs/demo.md` is the five-minute walk-through pointing at the
  local compose stack. The 90-second phone-recorded video portion of
  Task D5 is deferred until Task D1 (testnet deploy) lands.

### v0.2 known deferrals (still open for v0.3)

- **Phase B implementation (Tasks B2–B7).** The design doc is in;
  the actual ChaCha20 + Poly1305 + AEAD Circom templates are a
  multi-day engineering effort and have not been written. Tracked
  in `paper/design/chacha20-circuit.md`.
- **Task D1 — testnet deployment.** Needs a funded testnet wallet,
  which this autonomous flow intentionally cannot provide. Deploy
  scripts (`pnpm --filter @zktguard/contracts deploy:*`) are ready.
- **Task D4 — Playwright e2e.** Gated on D1.
- **Task D6 — paper revisions with testnet measurements.** Gated on
  D1.
- **v0.2 release tag.** Not cut. Will land once the above unblock.

### v0.2 Phase C — cross-contract async wiring

The verifier, registry, and soulbound collection now talk to each
other end-to-end.

- **AppRegistry** gains a public `op::query_registered`; any contract
  can ask the registry whether a pair is present, and the registry
  replies with `op::query_reply` to the original sender.
- **Groth16 verifier** now parks each accepted proof under a fresh
  query id, sends `op::query_registered` to the registry, and
  completes the mint on `op::query_reply`. Storage grows to include
  the parked-proof dictionary, admin / registry / collection addresses,
  and a `next_query_id` counter.
- **SoulboundCollection** gains an owner-gated `op::set_verifier` so
  the admin can rotate the minter address (and exit code 415 for
  non-owner attempts).
- New verifier error codes: 430 (reply from non-registry), 431
  (unknown query_id), 432 (admin-only op from non-admin), 433
  (registry unset), 434 (collection unset).
- New verifier ops: `op::query_reply`, `op::sweep_expired`,
  `op::set_registry`, `op::set_collection`, `op::set_admin`.
- New integration test in `contracts/tests/asyncFlow.spec.ts` walks
  the four-message sequence end-to-end and exercises the
  registry-says-no and invalid-proof branches.

### v0.2 Phase B design — ChaCha20-Poly1305 in the circuit

- Phase B's design document lives at
  `paper/design/chacha20-circuit.md`. It covers the quarter-round
  arithmetic, the five-limb Poly1305 accumulator, the AEAD
  composition per RFC 8439, and an honest constraint-count budget.
  Implementation lands in a future commit.
- The paper's Construction section and Docusaurus construction page
  both link to the design doc.

### v0.2 Phase A — real trusted setup

The placeholder VK from v0.1 is retired in favour of a real
deterministic Phase-2 contribution against a local BLS12-381 Powers of
Tau ceremony.

- **Circuit retargeted to BLS12-381.** v0.1 compiled to bn128 by
  default; v0.2 invokes `circom -p bls12381` so the Groth16 verifier
  on TON (which reads BLS12-381 pairing precompiles) actually matches
  the curve the proof lives in.
- **Phase-A slim circuit.** Drops the v0.1 stubs whose witness
  generation required external fixtures (AEAD, transcript commitment,
  attestor signature). Phase B (next) reintroduces a real
  ChaCha20-Poly1305 body in-circuit.
- **Real trusted setup.** `circuits/scripts/setup.sh` performs a local
  BLS12-381 PoT (capacity 2^14) with deterministic Phase-1 and Phase-2
  seeds, then exports the VK. Idempotent: set `FORCE_REGEN=1` to
  rebuild. See `circuits/PTAU.md` for the research-grade caveat.
- **Public-input layout change.** `nullifier` is now the circuit's
  output and therefore the FIRST public signal in the proof's
  public-input vector. The remaining seven follow the circuit's
  `public []` declaration. The FunC verifier and the SDK encode the
  new order; the v0.1 `(nonce, …, nullifier, …)` shape is retired.
- **SDK strips synthetic proving.** `craftSyntheticProof` and
  `PLACEHOLDER_VK` are removed. `requireClaim()` now posts the witness
  to a remote prover via `config.proverUrl`. `init()` validates the
  field is set.
- **circom v2.2 in CI.** Built from source via
  `scripts/install_circom.sh` and cached across runs.
- **Real-proof fixture for sandbox tests.** Committed at
  `contracts/tests/fixtures/phase_a_accept.json`. The Groth16Verifier
  sandbox suite verifies the fixture end-to-end against the real VK;
  reject paths mutate fields of the fixture to hit each error code
  without re-proving.

## [v0.1] — 2026-05-21

First tagged research-artifact release. Everything is testnet-only; do
not deploy to mainnet.

### Added

- **Contracts (Task 1, 4, 5, 6).** FunC contracts for:
  - Pairing sanity check (calls TON's `BLS_PAIRING` opcode end-to-end).
  - Groth16 verifier over BLS12-381 with a placeholder VK; recognises
    error codes 401–413.
  - Soulbound credential (Collection + Item, TEP-62-shaped) rejecting
    transfer with exit 410.
  - App registry storing `(app_id, claim_type)` pairs in a 96-bit dict.
- **Circuits (Task 2).** Circom skeleton for the `account_age` claim
  with 8 public inputs and 6 constraint groups. `NullifierPoseidon`,
  `TimestampThreshold`, and `AttestorEdDSAVerify` are implemented;
  AEAD / commitment / JSON-extract are stubbed.
- **Trusted setup (Task 3).** Deterministic `circuits/scripts/setup.sh`
  pinned against Hermez PoT 2^15. Placeholder `verification_key.json`
  matching the FunC verifier.
- **Attestor (Task 7).** Go binary `zktguard-attestor` signing
  Poseidon-hashed transcripts with BabyJubjub EdDSA. Bundled
  `zktguard-stub` server for deterministic Telegram-shaped fixtures.
- **Prover (Task 8).** Rust binary `zktguard-prover` emitting
  synthetic Groth16 proofs against the placeholder VK; CLI mirrors the
  shape the real prover will use post-Task-3.
- **SDK (Task 10).** `@zktguard/sdk` with `init`, `requireClaim`,
  `getCredential`, `verifyCredential`. Browser-safe (no Buffer
  dependency). Bundle is well under the 50 KB gzip cap.
- **Mini App (Task 9).** React + TON Connect reference app driving the
  SDK; Vitest unit suite.
- **Examples (Task 11).** `quest-gate`, `airdrop-gate`, `dao-vote` —
  three demo apps sharing a single component.
- **Docs (Task 12).** Docusaurus 3 site with Overview, Construction,
  Architecture, Running, SDK reference, Examples, Paper, and FAQ.
- **Paper (Task 13).** LaTeX draft with all DoD sections + a
  reproducibility appendix.
- **Reproducibility (Task 14).** `scripts/reproduce.sh` + Python
  checker, hashes pinned in `REPRODUCE.md`.

### Known limitations

- **Placeholder VK.** The verifier contract embeds a placeholder
  verification key. Anyone holding the VK can craft an accepting
  proof. Real proofs land with the real trusted-setup output.
- **Testnet only.** No mainnet deployment. The deploy scripts work but
  this release does not pin testnet addresses — see
  `contracts/DEPLOYMENTS.md`.
- **Attestor signs with BabyJubjub EdDSA**, not BLS12-381 as the
  bible's Part C originally described. The circuit cannot verify BLS
  in-zk at v0 cost targets. `circuits/STATS.md` tracks this.
- **Verifier does not call the registry.** v0 hard-codes acceptance of
  `(app_id, claim_type) = (1, 1)`.
- **No real Telegram traffic.** The attestor talks to a stub server.

### Deferred to v0.2

- Real circom compile + real trusted-setup ceremony run.
- Cross-contract send from the verifier to the soulbound collection
  on successful proof verification.
- Verifier ↔ Registry wiring (either an admin-pushed snapshot or a
  deferred-reply pattern).
- Playwright E2E for the Mini App against testnet.
- Paper PDF posted to IACR ePrint or arXiv.
- GitHub Pages deployment of the Docusaurus site.

### Test totals at tag

- `contracts` (jest, sandbox): **23/23** passing.
- `circuits` (mocha): **4** JS-only passing; **4** circom-tester
  suites skipped pending circom v2 install.
- `sdk` (jest): **14/14** passing.
- `miniapp` (vitest, jsdom): **2/2** passing.
- `examples/*` (vitest, jsdom): **1/1** each, **3/3** total.
- `attestor` (`go test ./…`): **8/8** passing.
- `prover` (`cargo test`): **4/4** passing.
- `docs` (`docusaurus build`): clean.
- `paper` (`make`): builds under `pdflatex` ≥ TeX Live 2024.
