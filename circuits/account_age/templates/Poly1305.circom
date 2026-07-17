pragma circom 2.1.6;

include "circomlib/circuits/bitify.circom";
include "circomlib/circuits/comparators.circom";

/*
 * Poly1305 (v0.2 Phase B, Task B3)
 * --------------------------------
 * RFC 8439 §2.5 one-time MAC. The 130-bit accumulator lives in five
 * limbs of ≤ 26 bits so the per-block product (acc + n) · r stays
 * under 2^56 per partial product — comfortably inside the scalar
 * field. Reduction modulo 2^130 − 5 is lazy: each block witnesses a
 * quotient/remainder pair and only constrains the remainder to 130
 * bits; the canonical reduction happens once, in Poly1305Finalize.
 *
 * Variable message length is handled with a thermometer selector
 * (LengthSelector): one boolean signal per byte, constrained monotone
 * non-increasing and summing to the length. The selector masks
 * message bytes, places the 0x01 terminator, and gates whether a
 * block updates the accumulator.
 *
 * The building blocks (LengthSelector, Poly1305Mul, Poly1305Blocks,
 * Poly1305Finalize) are shared with the ChaCha20-Poly1305 AEAD
 * composition (Task B4), which chains accumulator state across the
 * 16-byte-aligned AAD / ciphertext / lengths regions of the RFC §2.8
 * MAC data.
 */

// Witness-time indicator: 1 if k < len else 0.
function Poly1305IndLt(k, len) {
    if (k < len) {
        return 1;
    }
    return 0;
}

/*
 * Thermometer length selector: sel[k] = 1 iff k < length. Booleanity,
 * monotonicity and the sum constraint together force exactly this
 * shape and bound length to [0, maxBytes].
 */
template LengthSelector(maxBytes) {
    signal input  length;
    signal output sel[maxBytes];

    var selSum = 0;
    for (var k = 0; k < maxBytes; k++) {
        sel[k] <-- Poly1305IndLt(k, length);
        sel[k] * (sel[k] - 1) === 0;
        if (k > 0) {
            sel[k] * (1 - sel[k - 1]) === 0;
        }
        selSum += sel[k];
    }
    selSum === length;
}

/*
 * One accumulator step: accOut ≡ (accIn + n) · r (mod 2^130 − 5),
 * accOut limbs < 2^26 by decomposition. Caller must guarantee
 * accIn / n / r limbs < 2^26 so partial products stay under 2^56.
 */
template Poly1305Mul() {
    signal input  accIn[5];
    signal input  nLimb[5];
    signal input  rLimb[5];
    signal output accOut[5];

    var P130 = 2 ** 130 - 5;

    signal prod[5][5];
    for (var a = 0; a < 5; a++) {
        for (var b = 0; b < 5; b++) {
            prod[a][b] <== (accIn[a] + nLimb[a]) * rLimb[b];
        }
    }

    // Fold limb weights: 2^(26k) for k ≥ 5 collapses to
    // 5 · 2^(26(k−5)) because 2^130 ≡ 5 (mod 2^130 − 5).
    var accPrime = 0;
    for (var a = 0; a < 5; a++) {
        for (var b = 0; b < 5; b++) {
            var w = a + b;
            if (w < 5) {
                accPrime += prod[a][b] * 2 ** (26 * w);
            } else {
                accPrime += prod[a][b] * 5 * 2 ** (26 * (w - 5));
            }
        }
    }

    // Lazy reduction: accPrime = q·(2^130−5) + rem, rem < 2^130.
    // accPrime < 2^161, so q fits 35 bits with slack.
    signal q;
    signal rem;
    q <-- accPrime \ P130;
    rem <-- accPrime % P130;
    component qBits = Num2Bits(35);
    qBits.in <== q;
    component remBits = Num2Bits(130);
    remBits.in <== rem;
    accPrime === q * P130 + rem;

    for (var l = 0; l < 5; l++) {
        var limb = 0;
        for (var t = 0; t < 26; t++) {
            limb += remBits.out[26 * l + t] * 2 ** t;
        }
        accOut[l] <== limb;
    }
}

/*
 * Runs the accumulator over a sequence of 16-byte blocks. Bytes are
 * range-checked and masked by the caller-provided thermometer
 * selector; blocks whose first byte is inactive pass the accumulator
 * through unchanged.
 *
 * blockAligned = 0: RFC §2.5 message semantics — the final partial
 *   block of length L gets terminator 2^(8L) via a telescoped
 *   boundary sum, a full final block gets 2^128.
 * blockAligned = 1: every active block is treated as full (zero
 *   padding included in the MAC data), terminator always 2^128 —
 *   the §2.8 AEAD regions.
 */
template Poly1305Blocks(maxBytes, blockAligned) {
    signal input  rLimb[5];
    signal input  accIn[5];
    signal input  data[maxBytes];
    signal input  sel[maxBytes];
    signal output accOut[5];

    var maxBlocks = (maxBytes + 15) \ 16;

    component dataBits[maxBytes];
    signal mbyte[maxBytes];
    for (var k = 0; k < maxBytes; k++) {
        dataBits[k] = Num2Bits(8);
        dataBits[k].in <== data[k];
        mbyte[k] <== sel[k] * data[k];
    }

    component nBits[maxBlocks];
    component mul[maxBlocks];
    signal accNext[maxBlocks][5];

    var accPrev[5];
    for (var l = 0; l < 5; l++) {
        accPrev[l] = accIn[l];
    }

    for (var blk = 0; blk < maxBlocks; blk++) {
        var nVal = 0;
        for (var j = 0; j < 16; j++) {
            var k = 16 * blk + j;
            if (k < maxBytes) {
                nVal += mbyte[k] * 2 ** (8 * j);
            }
        }
        if (blockAligned == 1) {
            nVal += sel[16 * blk] * (2 ** 128);
        } else {
            for (var j = 0; j < 15; j++) {
                var k = 16 * blk + j;
                var diff = 0;
                if (k < maxBytes) {
                    diff += sel[k];
                }
                if (k + 1 < maxBytes) {
                    diff -= sel[k + 1];
                }
                nVal += diff * 2 ** (8 * (j + 1));
            }
            if (16 * blk + 15 < maxBytes) {
                nVal += sel[16 * blk + 15] * (2 ** 128);
            }
        }

        nBits[blk] = Num2Bits(130);
        nBits[blk].in <== nVal;

        mul[blk] = Poly1305Mul();
        for (var l = 0; l < 5; l++) {
            var limb = 0;
            for (var t = 0; t < 26; t++) {
                limb += nBits[blk].out[26 * l + t] * 2 ** t;
            }
            mul[blk].nLimb[l] <== limb;
            mul[blk].accIn[l] <== accPrev[l];
            mul[blk].rLimb[l] <== rLimb[l];
        }

        // Inactive blocks (beyond the selector) pass acc through.
        for (var l = 0; l < 5; l++) {
            accNext[blk][l] <== sel[16 * blk] * (mul[blk].accOut[l] - accPrev[l]) + accPrev[l];
        }
        for (var l = 0; l < 5; l++) {
            accPrev[l] = accNext[blk][l];
        }
    }

    for (var l = 0; l < 5; l++) {
        accOut[l] <== accPrev[l];
    }
}

/*
 * Canonical reduction of the lazy accumulator, then tag = low 128
 * bits of acc + s. Caller provides s as a value (linear form over
 * range-checked bytes), < 2^128.
 */
template Poly1305Finalize() {
    signal input  acc[5];
    signal input  sVal;
    signal output tag[16];

    var P130 = 2 ** 130 - 5;

    var accVal = 0;
    for (var l = 0; l < 5; l++) {
        accVal += acc[l] * 2 ** (26 * l);
    }

    // acc < 2^130 < 2·(2^130−5), so the canonical quotient is 0 or 1.
    signal qFin;
    qFin <-- accVal \ P130;
    qFin * (qFin - 1) === 0;
    signal canon;
    canon <== accVal - qFin * P130;
    component canonBits = Num2Bits(130);
    canonBits.in <== canon;
    component canonLt = LessThan(131);
    canonLt.in[0] <== canon;
    canonLt.in[1] <== P130;
    canonLt.out === 1;

    // tag = low 128 bits of canon + s  (sum < 2^131)
    component sumBits = Num2Bits(131);
    sumBits.in <== canon + sVal;
    for (var i = 0; i < 16; i++) {
        var byteVal = 0;
        for (var b = 0; b < 8; b++) {
            byteVal += sumBits.out[8 * i + b] * 2 ** b;
        }
        tag[i] <== byteVal;
    }
}

/*
 * RFC 8439 §2.5 Poly1305 with the DoD signature: 32-byte r‖s key,
 * variable-length byte message, 16-byte tag.
 */
template Poly1305(maxMessageBytes) {
    signal input  key[32];                   // r || s, byte array
    signal input  message[maxMessageBytes];  // byte array
    signal input  messageLength;             // ≤ maxMessageBytes
    signal output tag[16];                   // 128-bit MAC, byte array

    component keyBits[32];
    for (var i = 0; i < 32; i++) {
        keyBits[i] = Num2Bits(8);
        keyBits[i].in <== key[i];
    }

    // Clamp r (RFC 8439 §2.5): little-endian bytes 3/7/11/15 &= 0x0f,
    // bytes 4/8/12 &= 0xfc; then split into 5 × 26-bit limbs.
    var rBit[128];
    for (var i = 0; i < 16; i++) {
        for (var b = 0; b < 8; b++) {
            var keep = 1;
            if ((i == 3 || i == 7 || i == 11 || i == 15) && b >= 4) {
                keep = 0;
            }
            if ((i == 4 || i == 8 || i == 12) && b < 2) {
                keep = 0;
            }
            if (keep == 1) {
                rBit[8 * i + b] = keyBits[i].out[b];
            } else {
                rBit[8 * i + b] = 0;
            }
        }
    }

    component len = LengthSelector(maxMessageBytes);
    len.length <== messageLength;

    component blocks = Poly1305Blocks(maxMessageBytes, 0);
    for (var l = 0; l < 5; l++) {
        var limb = 0;
        for (var t = 0; t < 26; t++) {
            if (26 * l + t < 128) {
                limb += rBit[26 * l + t] * 2 ** t;
            }
        }
        blocks.rLimb[l] <== limb;
        blocks.accIn[l] <== 0;
    }
    for (var k = 0; k < maxMessageBytes; k++) {
        blocks.data[k] <== message[k];
        blocks.sel[k] <== len.sel[k];
    }

    component fin = Poly1305Finalize();
    var sVal = 0;
    for (var i = 0; i < 16; i++) {
        sVal += key[16 + i] * 2 ** (8 * i);
    }
    for (var l = 0; l < 5; l++) {
        fin.acc[l] <== blocks.accOut[l];
    }
    fin.sVal <== sVal;
    for (var i = 0; i < 16; i++) {
        tag[i] <== fin.tag[i];
    }
}
