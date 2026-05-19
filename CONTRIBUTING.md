# Contributing to zkTGuard

zkTGuard is a solo research project at v0. External contributions are not solicited before the v0.1 release. Issues and questions are welcome.

## Scope

This repository implements a research artifact: zkTLS proxy attestation over Telegram's web API, a Groth16 verifier in FunC for TON, and a reference Mini App and SDK. It is not a product and is not operated as a service.

Out of scope for v0.x:

- Hosted prover or attestor services
- Per-verification fees, billing, or any payment flow
- Multi-region or production deployment guidance
- Custom claim circuit submission
- Token, points, or incentive programs

## Commit style

[Conventional Commits](https://www.conventionalcommits.org/). Examples:

```
feat(circuits): add account-age circuit constraints
fix(verifier): correct public-input ordering
docs(paper): expand related-work section
chore(ci): bump node action
```

Allowed types: `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `perf`, `build`, `ci`.

## Branches and releases

Solo trunk-based development. Direct commits to `main`. Releases are tagged from `main` (`v0.1`, etc.). No long-lived feature branches in v0.

## Licensing

All contributions are licensed under MIT, matching the repository license. Dependencies must use a permissive license (MIT, Apache 2.0, BSD). GPL and AGPL are not accepted in non-test code.

## Code style

- TypeScript: Prettier + ESLint
- Rust: `rustfmt`, `clippy -D warnings`
- Go: `gofmt`, `go vet`
- FunC: community formatter

## Reporting issues

Open a GitHub issue with a minimal reproduction. For suspected cryptographic flaws, please open the issue privately first by emailing the address listed in the paper, once the paper is published.
