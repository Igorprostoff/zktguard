# Changelog

All notable changes are recorded here. The format roughly follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions
follow SemVer.

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
