pragma circom 2.1.6;

include "circomlib/circuits/poseidon.circom";

/*
 * TranscriptCommitment (v0.2 Phase B, Task B5 — real body)
 * --------------------------------------------------------
 * Poseidon commitment over the full attested session:
 *
 *   digest = Poseidon(keyHi, keyLo, nonceVal, ctHash, aadHash,
 *                     tagVal, ciphertextLength, aadLength)
 *
 * where ctHash / aadHash fold the (padded) byte buffers in 31-byte
 * big-endian chunks — the same chunking the Go attestor's
 * TranscriptDigest uses — via a sequential 2-ary Poseidon chain
 * h_{i+1} = Poseidon(h_i, chunk_i), h_0 = 0. Lengths enter the outer
 * hash so zero padding cannot alias two transcripts.
 *
 * This digest is exactly the payload the attestor signs in v0.2
 * (Task B6): Poseidon(key ‖ nonce ‖ ciphertext_hash ‖ aad_hash ‖ tag).
 * The signature itself is NOT verified in-circuit in v0.2 — the
 * circuit runs on BLS12-381 while the attestor signs
 * EdDSA-BabyJubjub over BN254, and a cross-field verify is a v0.3
 * work item (design doc §6). Until then the digest is computed and
 * anchored so the constraint cost is real and the v0.3 change is a
 * wiring diff, and the attestor signature is checked off-circuit.
 */

template PoseidonFold31(maxBytes) {
    signal input  data[maxBytes];   // bytes, range-checked upstream
    signal output out;

    var nChunks = (maxBytes + 30) \ 31;
    component h[nChunks];

    var prev = 0;
    for (var c = 0; c < nChunks; c++) {
        // 31-byte big-endian chunk value, zero-padded at the tail.
        var chunkVal = 0;
        var chunkLen = 31;
        if (31 * c + chunkLen > maxBytes) {
            chunkLen = maxBytes - 31 * c;
        }
        for (var i = 0; i < chunkLen; i++) {
            chunkVal += data[31 * c + i] * 2 ** (8 * (chunkLen - 1 - i));
        }
        h[c] = Poseidon(2);
        h[c].inputs[0] <== prev;
        h[c].inputs[1] <== chunkVal;
        prev = h[c].out;
    }
    out <== prev;
}

template TranscriptCommitment(maxCiphertextBytes, maxAADBytes) {
    signal input  key[32];                        // bytes
    signal input  nonce[12];                      // bytes
    signal input  ciphertext[maxCiphertextBytes]; // bytes
    signal input  ciphertextLength;
    signal input  aad[maxAADBytes];               // bytes
    signal input  aadLength;
    signal input  tag[16];                        // bytes
    signal output digest;

    component ctHash = PoseidonFold31(maxCiphertextBytes);
    for (var i = 0; i < maxCiphertextBytes; i++) {
        ctHash.data[i] <== ciphertext[i];
    }
    component aadHash = PoseidonFold31(maxAADBytes);
    for (var i = 0; i < maxAADBytes; i++) {
        aadHash.data[i] <== aad[i];
    }

    // 16-byte big-endian packings; each fits a field element.
    var keyHi = 0;
    var keyLo = 0;
    for (var i = 0; i < 16; i++) {
        keyHi += key[i] * 2 ** (8 * (15 - i));
        keyLo += key[16 + i] * 2 ** (8 * (15 - i));
    }
    var nonceVal = 0;
    for (var i = 0; i < 12; i++) {
        nonceVal += nonce[i] * 2 ** (8 * (11 - i));
    }
    var tagVal = 0;
    for (var i = 0; i < 16; i++) {
        tagVal += tag[i] * 2 ** (8 * (15 - i));
    }

    component outer = Poseidon(8);
    outer.inputs[0] <== keyHi;
    outer.inputs[1] <== keyLo;
    outer.inputs[2] <== nonceVal;
    outer.inputs[3] <== ctHash.out;
    outer.inputs[4] <== aadHash.out;
    outer.inputs[5] <== tagVal;
    outer.inputs[6] <== ciphertextLength;
    outer.inputs[7] <== aadLength;
    digest <== outer.out;
}
