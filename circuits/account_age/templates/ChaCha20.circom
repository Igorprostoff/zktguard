pragma circom 2.1.6;

include "circomlib/circuits/bitify.circom";

/*
 * ChaCha20 (v0.2 Phase B, Task B2)
 * --------------------------------
 * RFC 8439 ChaCha20 stream cipher as a Circom template. The state is
 * carried through the rounds in bit-sliced form (each 32-bit word as
 * 32 boolean signals, bit 0 = LSB) so that XOR costs one constraint
 * per bit and rotations are free rewiring. Only the modular adds pay
 * for a fresh 33-bit decomposition.
 *
 * Cost per quarter-round: 4 × 33 (adds) + 4 × 32 (xors) = 260
 * constraints; a 64-byte block (80 quarter-rounds + the final
 * state addition and I/O packing) lands near 23 k constraints —
 * under the 50 k/block budget in paper/design/chacha20-circuit.md.
 *
 * Word convention: every uint32 signal packs 4 bytes little-endian,
 * matching the RFC's serialisation of key, nonce and keystream.
 */

// out = (a + b) mod 2^32, all operands bit-sliced little-endian.
template Add32() {
    signal input  a[32];
    signal input  b[32];
    signal output out[32];

    var lc = 0;
    for (var i = 0; i < 32; i++) {
        lc += (a[i] + b[i]) * 2 ** i;
    }
    component dec = Num2Bits(33);
    dec.in <== lc;
    for (var i = 0; i < 32; i++) {
        out[i] <== dec.out[i];
    }
}

// out = a XOR b, bit-sliced. Assumes inputs are already boolean.
template Xor32() {
    signal input  a[32];
    signal input  b[32];
    signal output out[32];

    for (var i = 0; i < 32; i++) {
        out[i] <== a[i] + b[i] - 2 * a[i] * b[i];
    }
}

/*
 * One RFC 8439 §2.1 quarter-round:
 *   a += b; d ^= a; d <<<= 16;
 *   c += d; b ^= c; b <<<= 12;
 *   a += b; d ^= a; d <<<= 8;
 *   c += d; b ^= c; b <<<= 7;
 * Rotations are pure rewiring on the bit slices.
 */
template QuarterRound() {
    signal input  a[32];
    signal input  b[32];
    signal input  c[32];
    signal input  d[32];
    signal output outA[32];
    signal output outB[32];
    signal output outC[32];
    signal output outD[32];

    component addA1 = Add32();
    component xorD1 = Xor32();
    component addC1 = Add32();
    component xorB1 = Xor32();
    component addA2 = Add32();
    component xorD2 = Xor32();
    component addC2 = Add32();
    component xorB2 = Xor32();

    signal d1[32];
    signal b1[32];

    for (var i = 0; i < 32; i++) {
        addA1.a[i] <== a[i];
        addA1.b[i] <== b[i];
    }
    for (var i = 0; i < 32; i++) {
        xorD1.a[i] <== d[i];
        xorD1.b[i] <== addA1.out[i];
    }
    for (var i = 0; i < 32; i++) {
        d1[(i + 16) % 32] <== xorD1.out[i];
    }
    for (var i = 0; i < 32; i++) {
        addC1.a[i] <== c[i];
        addC1.b[i] <== d1[i];
    }
    for (var i = 0; i < 32; i++) {
        xorB1.a[i] <== b[i];
        xorB1.b[i] <== addC1.out[i];
    }
    for (var i = 0; i < 32; i++) {
        b1[(i + 12) % 32] <== xorB1.out[i];
    }
    for (var i = 0; i < 32; i++) {
        addA2.a[i] <== addA1.out[i];
        addA2.b[i] <== b1[i];
    }
    for (var i = 0; i < 32; i++) {
        xorD2.a[i] <== d1[i];
        xorD2.b[i] <== addA2.out[i];
    }
    for (var i = 0; i < 32; i++) {
        outD[(i + 8) % 32] <== xorD2.out[i];
    }
    for (var i = 0; i < 32; i++) {
        addC2.a[i] <== addC1.out[i];
        addC2.b[i] <== outD[i];
    }
    for (var i = 0; i < 32; i++) {
        xorB2.a[i] <== b1[i];
        xorB2.b[i] <== addC2.out[i];
    }
    for (var i = 0; i < 32; i++) {
        outB[(i + 7) % 32] <== xorB2.out[i];
        outA[i] <== addA2.out[i];
        outC[i] <== addC2.out[i];
    }
}

// One double round: 4 column quarter-rounds then 4 diagonal ones.
template DoubleRound() {
    signal input  in[16][32];
    signal output out[16][32];

    var colIdx[4][4]  = [[0, 4,  8, 12], [1, 5,  9, 13], [2, 6, 10, 14], [3, 7, 11, 15]];
    var diagIdx[4][4] = [[0, 5, 10, 15], [1, 6, 11, 12], [2, 7,  8, 13], [3, 4,  9, 14]];

    component col[4];
    component diag[4];
    signal mid[16][32];

    for (var q = 0; q < 4; q++) {
        col[q] = QuarterRound();
        for (var i = 0; i < 32; i++) {
            col[q].a[i] <== in[colIdx[q][0]][i];
            col[q].b[i] <== in[colIdx[q][1]][i];
            col[q].c[i] <== in[colIdx[q][2]][i];
            col[q].d[i] <== in[colIdx[q][3]][i];
        }
        for (var i = 0; i < 32; i++) {
            mid[colIdx[q][0]][i] <== col[q].outA[i];
            mid[colIdx[q][1]][i] <== col[q].outB[i];
            mid[colIdx[q][2]][i] <== col[q].outC[i];
            mid[colIdx[q][3]][i] <== col[q].outD[i];
        }
    }
    for (var q = 0; q < 4; q++) {
        diag[q] = QuarterRound();
        for (var i = 0; i < 32; i++) {
            diag[q].a[i] <== mid[diagIdx[q][0]][i];
            diag[q].b[i] <== mid[diagIdx[q][1]][i];
            diag[q].c[i] <== mid[diagIdx[q][2]][i];
            diag[q].d[i] <== mid[diagIdx[q][3]][i];
        }
        for (var i = 0; i < 32; i++) {
            out[diagIdx[q][0]][i] <== diag[q].outA[i];
            out[diagIdx[q][1]][i] <== diag[q].outB[i];
            out[diagIdx[q][2]][i] <== diag[q].outC[i];
            out[diagIdx[q][3]][i] <== diag[q].outD[i];
        }
    }
}

/*
 * One 64-byte keystream block (RFC 8439 §2.3): init state, 10 double
 * rounds, add the initial state back word-wise.
 */
template ChaCha20Block() {
    signal input  keyBits[8][32];
    signal input  nonceBits[3][32];
    signal input  counterBits[32];
    signal output ksBits[16][32];

    var CONSTS[4] = [0x61707865, 0x3320646e, 0x79622d32, 0x6b206574];

    signal init[16][32];
    for (var w = 0; w < 4; w++) {
        for (var i = 0; i < 32; i++) {
            init[w][i] <== (CONSTS[w] >> i) & 1;
        }
    }
    for (var w = 0; w < 8; w++) {
        for (var i = 0; i < 32; i++) {
            init[4 + w][i] <== keyBits[w][i];
        }
    }
    for (var i = 0; i < 32; i++) {
        init[12][i] <== counterBits[i];
    }
    for (var w = 0; w < 3; w++) {
        for (var i = 0; i < 32; i++) {
            init[13 + w][i] <== nonceBits[w][i];
        }
    }

    component rounds[10];
    for (var r = 0; r < 10; r++) {
        rounds[r] = DoubleRound();
        for (var w = 0; w < 16; w++) {
            for (var i = 0; i < 32; i++) {
                rounds[r].in[w][i] <== (r == 0) ? init[w][i] : rounds[r - 1].out[w][i];
            }
        }
    }

    component fin[16];
    for (var w = 0; w < 16; w++) {
        fin[w] = Add32();
        for (var i = 0; i < 32; i++) {
            fin[w].a[i] <== rounds[9].out[w][i];
            fin[w].b[i] <== init[w][i];
        }
        for (var i = 0; i < 32; i++) {
            ksBits[w][i] <== fin[w].out[i];
        }
    }
}

/*
 * ChaCha20 encryption stream (RFC 8439 §2.4). Block b uses counter
 * `counter + b`. Interface is uint32 words, 4 bytes little-endian
 * each, per paper/design/chacha20-circuit.md §1.
 *
 * The Num2Bits decompositions double as range checks on every input
 * word; witness generation fails on values ≥ 2^32.
 */
template ChaCha20(numBlocks) {
    signal input  key[8];                      // 8 × uint32, little-endian
    signal input  nonce[3];                    // 3 × uint32
    signal input  counter;                     // uint32, initial counter
    signal input  plaintext[numBlocks * 16];   // uint32 words
    signal output ciphertext[numBlocks * 16];  // uint32 words

    component keyBits[8];
    for (var w = 0; w < 8; w++) {
        keyBits[w] = Num2Bits(32);
        keyBits[w].in <== key[w];
    }
    component nonceBits[3];
    for (var w = 0; w < 3; w++) {
        nonceBits[w] = Num2Bits(32);
        nonceBits[w].in <== nonce[w];
    }

    component blocks[numBlocks];
    component ctrBits[numBlocks];
    component ptBits[numBlocks * 16];
    component xors[numBlocks * 16];

    for (var b = 0; b < numBlocks; b++) {
        ctrBits[b] = Num2Bits(32);
        ctrBits[b].in <== counter + b;

        blocks[b] = ChaCha20Block();
        for (var w = 0; w < 8; w++) {
            for (var i = 0; i < 32; i++) {
                blocks[b].keyBits[w][i] <== keyBits[w].out[i];
            }
        }
        for (var w = 0; w < 3; w++) {
            for (var i = 0; i < 32; i++) {
                blocks[b].nonceBits[w][i] <== nonceBits[w].out[i];
            }
        }
        for (var i = 0; i < 32; i++) {
            blocks[b].counterBits[i] <== ctrBits[b].out[i];
        }

        for (var w = 0; w < 16; w++) {
            var s = b * 16 + w;
            ptBits[s] = Num2Bits(32);
            ptBits[s].in <== plaintext[s];
            xors[s] = Xor32();
            for (var i = 0; i < 32; i++) {
                xors[s].a[i] <== ptBits[s].out[i];
                xors[s].b[i] <== blocks[b].ksBits[w][i];
            }
            var lc = 0;
            for (var i = 0; i < 32; i++) {
                lc += xors[s].out[i] * 2 ** i;
            }
            ciphertext[s] <== lc;
        }
    }
}
