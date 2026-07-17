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
 * bits; the canonical reduction happens once, at the end.
 *
 * Variable message length is handled with a thermometer selector:
 * one boolean signal per byte, constrained monotone non-increasing
 * and summing to messageLength. The selector masks message bytes,
 * places the 0x01 terminator via the telescoped boundary sum, and
 * gates whether a block updates the accumulator.
 */

// Witness-time indicator: 1 if k < len else 0.
function Poly1305IndLt(k, len) {
    if (k < len) {
        return 1;
    }
    return 0;
}

template Poly1305(maxMessageBytes) {
    signal input  key[32];                   // r || s, byte array
    signal input  message[maxMessageBytes];  // byte array
    signal input  messageLength;             // ≤ maxMessageBytes
    signal output tag[16];                   // 128-bit MAC, byte array

    var P130 = 2 ** 130 - 5;
    var maxBlocks = (maxMessageBytes + 15) \ 16;

    // ---- byte range checks --------------------------------------
    component keyBits[32];
    for (var i = 0; i < 32; i++) {
        keyBits[i] = Num2Bits(8);
        keyBits[i].in <== key[i];
    }
    component msgBits[maxMessageBytes];
    for (var k = 0; k < maxMessageBytes; k++) {
        msgBits[k] = Num2Bits(8);
        msgBits[k].in <== message[k];
    }

    // ---- thermometer length selector ----------------------------
    signal sel[maxMessageBytes];
    var selSum = 0;
    for (var k = 0; k < maxMessageBytes; k++) {
        sel[k] <-- Poly1305IndLt(k, messageLength);
        sel[k] * (sel[k] - 1) === 0;
        if (k > 0) {
            sel[k] * (1 - sel[k - 1]) === 0;
        }
        selSum += sel[k];
    }
    selSum === messageLength;

    // ---- clamp r (RFC 8439 §2.5) and split into 5 × 26-bit limbs
    // clamp mask, little-endian bytes: bytes 3/7/11/15 &= 0x0f,
    // bytes 4/8/12 &= 0xfc.
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
    var rLimb[5];
    for (var l = 0; l < 5; l++) {
        rLimb[l] = 0;
        for (var t = 0; t < 26; t++) {
            if (26 * l + t < 128) {
                rLimb[l] += rBit[26 * l + t] * 2 ** t;
            }
        }
    }

    // s value (little-endian bytes 16..31)
    var sVal = 0;
    for (var i = 0; i < 16; i++) {
        sVal += key[16 + i] * 2 ** (8 * i);
    }

    // ---- masked message bytes -----------------------------------
    signal mbyte[maxMessageBytes];
    for (var k = 0; k < maxMessageBytes; k++) {
        mbyte[k] <== sel[k] * message[k];
    }

    // ---- per-block accumulation ---------------------------------
    component nBits[maxBlocks];
    signal prod[maxBlocks][5][5];
    signal q[maxBlocks];
    signal rem[maxBlocks];
    component qBits[maxBlocks];
    component remBits[maxBlocks];
    signal accNext[maxBlocks][5];

    var accPrev[5];
    for (var l = 0; l < 5; l++) {
        accPrev[l] = 0;
    }

    for (var blk = 0; blk < maxBlocks; blk++) {
        // n = masked chunk bytes + terminator 2^(8·blockLen);
        // boundary telescopes over the selector, full block hits the
        // sel[16·blk+15]·2^128 term.
        var nVal = 0;
        for (var j = 0; j < 16; j++) {
            var k = 16 * blk + j;
            if (k < maxMessageBytes) {
                nVal += mbyte[k] * 2 ** (8 * j);
            }
        }
        for (var j = 0; j < 15; j++) {
            var k = 16 * blk + j;
            var diff = 0;
            if (k < maxMessageBytes) {
                diff += sel[k];
            }
            if (k + 1 < maxMessageBytes) {
                diff -= sel[k + 1];
            }
            nVal += diff * 2 ** (8 * (j + 1));
        }
        if (16 * blk + 15 < maxMessageBytes) {
            nVal += sel[16 * blk + 15] * (2 ** 128);
        }

        nBits[blk] = Num2Bits(130);
        nBits[blk].in <== nVal;
        var nLimb[5];
        for (var l = 0; l < 5; l++) {
            nLimb[l] = 0;
            for (var t = 0; t < 26; t++) {
                nLimb[l] += nBits[blk].out[26 * l + t] * 2 ** t;
            }
        }

        // t = acc + n (limb-wise, ≤ 27 bits per limb), then t · r as
        // 25 partial products of two linear forms.
        var tLimb[5];
        for (var l = 0; l < 5; l++) {
            tLimb[l] = accPrev[l] + nLimb[l];
        }
        for (var a = 0; a < 5; a++) {
            for (var b = 0; b < 5; b++) {
                prod[blk][a][b] <== tLimb[a] * rLimb[b];
            }
        }

        // Fold limb weights: 2^(26k) for k ≥ 5 collapses to
        // 5 · 2^(26(k−5)) because 2^130 ≡ 5 (mod 2^130 − 5).
        var accPrime = 0;
        for (var a = 0; a < 5; a++) {
            for (var b = 0; b < 5; b++) {
                var w = a + b;
                if (w < 5) {
                    accPrime += prod[blk][a][b] * 2 ** (26 * w);
                } else {
                    accPrime += prod[blk][a][b] * 5 * 2 ** (26 * (w - 5));
                }
            }
        }

        // Lazy reduction: accPrime = q·(2^130−5) + rem, rem < 2^130.
        // accPrime < 2^161, so q fits 35 bits with slack.
        q[blk] <-- accPrime \ P130;
        rem[blk] <-- accPrime % P130;
        qBits[blk] = Num2Bits(35);
        qBits[blk].in <== q[blk];
        remBits[blk] = Num2Bits(130);
        remBits[blk].in <== rem[blk];
        accPrime === q[blk] * P130 + rem[blk];

        var remLimb[5];
        for (var l = 0; l < 5; l++) {
            remLimb[l] = 0;
            for (var t = 0; t < 26; t++) {
                remLimb[l] += remBits[blk].out[26 * l + t] * 2 ** t;
            }
        }

        // Inactive blocks (beyond messageLength) pass acc through.
        for (var l = 0; l < 5; l++) {
            accNext[blk][l] <== sel[16 * blk] * (remLimb[l] - accPrev[l]) + accPrev[l];
        }
        for (var l = 0; l < 5; l++) {
            accPrev[l] = accNext[blk][l];
        }
    }

    // ---- final canonical reduction and tag ----------------------
    var accVal = 0;
    for (var l = 0; l < 5; l++) {
        accVal += accPrev[l] * 2 ** (26 * l);
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
