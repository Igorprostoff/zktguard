#!/usr/bin/env python3
"""
Compares the live output of `scripts/reproduce.sh` against the
deterministic table in REPRODUCE.md. Used by CI.

Exit codes:
    0  every deterministic hash matches
    1  any deterministic hash diverges (or missing)
    2  malformed REPRODUCE.md
"""

from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
REPRODUCE_MD = ROOT / "REPRODUCE.md"


def parse_table(text: str) -> dict[str, str]:
    """Reads the markdown table under '## Deterministic artifacts'."""
    section_re = re.compile(
        r"## Deterministic artifacts.*?\n\n(.*?)\n\n##",
        re.DOTALL,
    )
    m = section_re.search(text)
    if not m:
        sys.exit("REPRODUCE.md: deterministic-artifacts section not found")
    rows: dict[str, str] = {}
    for line in m.group(1).splitlines():
        # `| `path` | `sha` |`
        cells = [c.strip() for c in line.split("|")]
        if len(cells) < 4:
            continue
        path_cell, sha_cell = cells[1], cells[2]
        if not path_cell.startswith("`") or not sha_cell.startswith("`"):
            continue
        path = path_cell.strip("`")
        sha = sha_cell.strip("`")
        if len(sha) == 64 and all(c in "0123456789abcdef" for c in sha):
            rows[path] = sha
    return rows


def run_reproduce() -> dict[str, str]:
    res = subprocess.run(
        ["bash", "scripts/reproduce.sh"],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    if res.returncode != 0:
        sys.stderr.write(res.stderr)
        sys.exit("reproduce.sh exited non-zero")
    out: dict[str, str] = {}
    for line in res.stdout.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        parts = line.split()
        if len(parts) != 2:
            continue
        path, sha = parts
        out[path] = sha
    return out


def main() -> int:
    if not REPRODUCE_MD.exists():
        sys.exit("REPRODUCE.md missing")
    expected = parse_table(REPRODUCE_MD.read_text())
    actual = run_reproduce()

    mismatches: list[str] = []
    for path, sha in expected.items():
        seen = actual.get(path)
        if seen is None:
            mismatches.append(f"  {path}: not produced (toolchain missing?)")
        elif seen != sha:
            mismatches.append(f"  {path}\n    want {sha}\n    got  {seen}")

    if mismatches:
        print("reproducibility check FAILED:")
        for m in mismatches:
            print(m)
        return 1
    print(f"reproducibility check OK ({len(expected)} artifacts)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
