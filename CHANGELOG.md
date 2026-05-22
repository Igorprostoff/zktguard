# Changelog

All notable changes are recorded here. The format roughly follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions
follow SemVer.

## [Unreleased]

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
