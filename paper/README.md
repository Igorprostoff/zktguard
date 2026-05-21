# paper

LaTeX source for the zkTGuard technical writeup.

## Sections

Abstract, Introduction, Related work, Construction, Implementation, Evaluation, Limitations, Future work, References, Reproducibility appendix.

## Build

```bash
cd paper
make           # writes zktguard.pdf
```

Requires `pdflatex` from TeX Live 2024 or newer. `make clean` removes auxiliary files; `make deepclean` also removes the PDF.

## Watch mode

```bash
make watch     # latexmk -pvc; needs latexmk on PATH
```

## ePrint / arXiv posting

The v0.1 PDF will be uploaded to IACR ePrint or arXiv once the reviewer pass is complete. The link will be recorded in `docs/docs/paper.md` and the root README.

## Bibliography

Inlined in `zktguard.tex` for the v0.1 draft. Will migrate to a separate `.bib` file once the manuscript stabilises.
