# docs

Docusaurus 3 site that hosts the public face of zkTGuard.

## Pages

- Overview
- Cryptographic construction
- Architecture
- Running the reference implementation
- SDK reference
- Examples
- Paper
- FAQ

## Develop

```bash
cd docs
pnpm install
pnpm dev          # http://127.0.0.1:3000
```

## Build

```bash
pnpm build
```

The static site is written to `docs/build/`. GitHub Pages deployment is configured at the repository level — `gh-pages` branch publishes from `docs/build/`. URL will appear in the root README once the first deploy finishes.
