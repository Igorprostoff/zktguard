SHELL := bash

TEX ?= pdflatex
SRC := zktguard.tex
OUT := zktguard.pdf

.PHONY: all clean watch deepclean

all: $(OUT)

$(OUT): $(SRC)
	@if ! command -v $(TEX) >/dev/null; then \
		echo "$(TEX) not on PATH; install TeX Live 2024+ and retry." >&2; \
		exit 1; \
	fi
	$(TEX) -interaction=nonstopmode -halt-on-error $(SRC) >/dev/null
	$(TEX) -interaction=nonstopmode -halt-on-error $(SRC) >/dev/null

clean:
	rm -f *.aux *.log *.out *.toc *.bbl *.blg *.synctex.gz

deepclean: clean
	rm -f $(OUT)

watch:
	@command -v latexmk >/dev/null || { echo "install latexmk to use 'make watch'" >&2; exit 1; }
	latexmk -pdf -pvc -interaction=nonstopmode $(SRC)
