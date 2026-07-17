pragma circom 2.1.6;

include "circomlib/circuits/bitify.circom";
include "ChaCha20.circom";
include "Poly1305.circom";

/*
 * ChaCha20-Poly1305 AEAD decryption (v0.2 Phase B, Task B4)
 * ---------------------------------------------------------
 * RFC 8439 §2.8. The template
 *   1. derives the one-time Poly1305 key from the counter-0 ChaCha20
 *      block over (key, nonce),
 *   2. computes the MAC over
 *        AAD ‖ pad16(AAD) ‖ CT ‖ pad16(CT) ‖ le64(|AAD|) ‖ le64(|CT|)
 *      and asserts it equals the witnessed tag,
 *   3. decrypts the ciphertext with counter 1.
 *
 * No shifting network is needed for the variable-length MAC data:
 * every region of the §2.8 layout is 16-byte aligned, so the Poly1305
 * accumulator (Poly1305Blocks with blockAligned = 1) simply chains
 * through AAD blocks, ciphertext blocks, and one final lengths block
 * whose value is a linear form of the two length signals.
 *
 * A tag mismatch violates the tag equality constraints, so witness
 * generation fails — there is no way to produce a proof for a forged
 * ciphertext.
 *
 * Outputs: plaintext bytes; positions ≥ ciphertextLength are zeroed.
 */
template ChaCha20Poly1305Decrypt(maxCiphertextBytes, maxAADBytes) {
    // maxCiphertextBytes < 2^14 keeps the lengths-block limb bound.
    assert(maxCiphertextBytes > 0);
    assert(maxCiphertextBytes < 16384);
    assert(maxAADBytes > 0);
    assert(maxAADBytes < 16384);

    signal input  key[32];                        // bytes
    signal input  nonce[12];                      // bytes
    signal input  ciphertext[maxCiphertextBytes]; // bytes
    signal input  ciphertextLength;               // ≤ maxCiphertextBytes
    signal input  aad[maxAADBytes];               // bytes
    signal input  aadLength;                      // ≤ maxAADBytes
    signal input  tag[16];                        // bytes, expected MAC
    signal output plaintext[maxCiphertextBytes];  // bytes

    var ctBlocks = (maxCiphertextBytes + 63) \ 64;

    // ---- byte range checks, bit views of key and nonce ----------
    component keyBits[32];
    for (var i = 0; i < 32; i++) {
        keyBits[i] = Num2Bits(8);
        keyBits[i].in <== key[i];
    }
    component nonceBits[12];
    for (var i = 0; i < 12; i++) {
        nonceBits[i] = Num2Bits(8);
        nonceBits[i].in <== nonce[i];
    }
    component tagBits[16];
    for (var i = 0; i < 16; i++) {
        tagBits[i] = Num2Bits(8);
        tagBits[i].in <== tag[i];
    }

    // ---- length selectors ---------------------------------------
    component selCt = LengthSelector(maxCiphertextBytes);
    selCt.length <== ciphertextLength;
    component selAad = LengthSelector(maxAADBytes);
    selAad.length <== aadLength;

    // ---- Poly1305 one-time key: ChaCha20 block, counter 0 -------
    component otk = ChaCha20Block();
    for (var w = 0; w < 8; w++) {
        for (var t = 0; t < 32; t++) {
            otk.keyBits[w][t] <== keyBits[4 * w + t \ 8].out[t % 8];
        }
    }
    for (var w = 0; w < 3; w++) {
        for (var t = 0; t < 32; t++) {
            otk.nonceBits[w][t] <== nonceBits[4 * w + t \ 8].out[t % 8];
        }
    }
    for (var t = 0; t < 32; t++) {
        otk.counterBits[t] <== 0;
    }

    // r = otk bytes 0..15 (words 0..3), clamped, as 5 × 26-bit limbs;
    // s = otk bytes 16..31 (words 4..7). Both directly from the
    // keystream bits — already boolean, no re-decomposition needed.
    var otkBit[256];
    for (var w = 0; w < 8; w++) {
        for (var t = 0; t < 32; t++) {
            otkBit[32 * w + t] = otk.ksBits[w][t];
        }
    }
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
                rBit[8 * i + b] = otkBit[8 * i + b];
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
    var sVal = 0;
    for (var t = 0; t < 128; t++) {
        sVal += otkBit[128 + t] * 2 ** t;
    }

    // ---- MAC: AAD blocks → CT blocks → lengths block ------------
    component macAad = Poly1305Blocks(maxAADBytes, 1);
    for (var l = 0; l < 5; l++) {
        macAad.rLimb[l] <== rLimb[l];
        macAad.accIn[l] <== 0;
    }
    for (var k = 0; k < maxAADBytes; k++) {
        macAad.data[k] <== aad[k];
        macAad.sel[k] <== selAad.sel[k];
    }

    component macCt = Poly1305Blocks(maxCiphertextBytes, 1);
    for (var l = 0; l < 5; l++) {
        macCt.rLimb[l] <== rLimb[l];
        macCt.accIn[l] <== macAad.accOut[l];
    }
    for (var k = 0; k < maxCiphertextBytes; k++) {
        macCt.data[k] <== ciphertext[k];
        macCt.sel[k] <== selCt.sel[k];
    }

    // Lengths block: n = le64(|AAD|) ‖ le64(|CT|) plus the 2^128
    // terminator. 2^64 = 2^(26·2 + 12), so |CT| lands in limb 2 with
    // weight 2^12; both lengths are < 2^14 so every limb stays under
    // 2^26.
    component macLen = Poly1305Mul();
    macLen.nLimb[0] <== aadLength;
    macLen.nLimb[1] <== 0;
    macLen.nLimb[2] <== ciphertextLength * 2 ** 12;
    macLen.nLimb[3] <== 0;
    macLen.nLimb[4] <== 2 ** 24;
    for (var l = 0; l < 5; l++) {
        macLen.rLimb[l] <== rLimb[l];
        macLen.accIn[l] <== macCt.accOut[l];
    }

    component fin = Poly1305Finalize();
    for (var l = 0; l < 5; l++) {
        fin.acc[l] <== macLen.accOut[l];
    }
    fin.sVal <== sVal;
    for (var i = 0; i < 16; i++) {
        tag[i] === fin.tag[i];
    }

    // ---- decrypt: CT XOR keystream (counter 1 + b) --------------
    component ks[ctBlocks];
    for (var b = 0; b < ctBlocks; b++) {
        ks[b] = ChaCha20Block();
        for (var w = 0; w < 8; w++) {
            for (var t = 0; t < 32; t++) {
                ks[b].keyBits[w][t] <== keyBits[4 * w + t \ 8].out[t % 8];
            }
        }
        for (var w = 0; w < 3; w++) {
            for (var t = 0; t < 32; t++) {
                ks[b].nonceBits[w][t] <== nonceBits[4 * w + t \ 8].out[t % 8];
            }
        }
        for (var t = 0; t < 32; t++) {
            ks[b].counterBits[t] <== ((b + 1) >> t) & 1;
        }
    }

    // Ciphertext bits are also decomposed inside macCt, but those
    // signals are private to that component, so pay the ~8
    // constraints per byte again here.
    component ctBits[maxCiphertextBytes];
    signal ptBit[maxCiphertextBytes][8];
    for (var k = 0; k < maxCiphertextBytes; k++) {
        ctBits[k] = Num2Bits(8);
        ctBits[k].in <== ciphertext[k];
        var blockIdx = k \ 64;
        var wordIdx = (k % 64) \ 4;
        var bitBase = 8 * (k % 4);
        var byteVal = 0;
        for (var t = 0; t < 8; t++) {
            // XOR of ct bit with keystream bit: a + b − 2ab
            ptBit[k][t] <== ctBits[k].out[t] + ks[blockIdx].ksBits[wordIdx][bitBase + t]
                        - 2 * ctBits[k].out[t] * ks[blockIdx].ksBits[wordIdx][bitBase + t];
            byteVal += ptBit[k][t] * 2 ** t;
        }
        plaintext[k] <== selCt.sel[k] * byteVal;
    }
}
