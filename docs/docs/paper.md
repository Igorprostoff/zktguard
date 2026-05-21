---
id: paper
title: Paper
---

# Paper

The canonical writeup lives at [`paper/zktguard.tex`](https://github.com/Igorprostoff/zktguard/blob/main/paper/zktguard.tex). v0.1 ships the LaTeX source; a rendered PDF will be posted to IACR ePrint or arXiv when the manuscript is ready for circulation.

## Building locally

```bash
cd paper
make           # writes zktguard.pdf
```

`pdflatex` 2024+ is required.

## Sections

| Section          | Status                                                  |
| ---------------- | ------------------------------------------------------- |
| Abstract         | Draft                                                   |
| Introduction     | Draft                                                   |
| Related work     | Draft (Reclaim, TLSNotary, Semaphore, World ID, zkLogin) |
| Construction     | Mirrors the Construction page on this site              |
| Implementation   | Cross-links to each workspace's README                  |
| Evaluation       | Numbers from `contracts/GAS.md` + `prover/BENCHMARKS.md`|
| Limitations      | Draft — see also `circuits/STATS.md`                    |
| Future work      | Draft                                                   |
| References       | Bibliography matches DoD Task 13                        |
| Reproducibility  | Pins commit hash + `scripts/reproduce.sh`               |

## Citation

Once an ePrint or arXiv number lands, the BibTeX stanza will appear
here.
