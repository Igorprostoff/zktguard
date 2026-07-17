#!/usr/bin/env node
//
// Splice freshly generated Groth16 VK constants into the FunC
// verifier. Runs vk_to_func.js against the committed
// account_age/verification_key.json and replaces the VK-accessor
// block in contracts/verifier/groth16_verifier.fc in place.
//
// The Phase-B circuit keeps the Phase-A public-input surface (8
// signals), so the set of accessors (alpha/beta/gamma/delta + IC_0..8)
// is unchanged — only the constants move.
//
// Usage: node scripts/regen_verifier_vk.mjs

import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CIRCUITS = path.resolve(__dirname, "..");
const FC = path.resolve(CIRCUITS, "..", "contracts", "verifier", "groth16_verifier.fc");

// 1. Generate the FunC accessor block.
const generated = execFileSync(
  "node",
  [path.join(__dirname, "vk_to_func.js")],
  { encoding: "utf8" },
);

// Keep only the slice functions (drop the leading "// generated…" and
// "// source:" comment lines vk_to_func prints).
const funcs = generated
  .split("\n")
  .filter((l, i, arr) => {
    // Trim the two banner comment lines at the top.
    if (i < 3 && l.startsWith("//")) return false;
    return true;
  })
  .join("\n")
  .trim();

// 2. Splice into the .fc between `slice vk_alpha_g1()` and the closing
// brace of `vk_ic_8`, preserving the surrounding banner comments.
const src = fs.readFileSync(FC, "utf8");
const startMarker = "slice vk_alpha_g1() inline {";
const startIdx = src.indexOf(startMarker);
if (startIdx < 0) throw new Error("vk_alpha_g1 accessor not found in .fc");

// End = the closing brace of the last vk_ic_* accessor, i.e. the last
// "}\n" before the Storage banner.
const storageIdx = src.indexOf(";; ===", startIdx);
if (storageIdx < 0) throw new Error("Storage banner not found after VK block");
// Walk back to the end of the previous function ("}\n").
const braceIdx = src.lastIndexOf("}", storageIdx);
if (braceIdx < 0) throw new Error("closing brace of VK block not found");

const before = src.slice(0, startIdx);
const after = src.slice(braceIdx + 1);
const next = `${before}${funcs}${after}`;

fs.writeFileSync(FC, next);
console.log(`spliced VK accessors into ${path.relative(process.cwd(), FC)}`);
