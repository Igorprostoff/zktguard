pragma circom 2.1.6;

include "circomlib/circuits/bitify.circom";
include "circomlib/circuits/comparators.circom";

/*
 * JsonTimestampExtract (v0.2 Phase B, Task B5 — real body)
 * --------------------------------------------------------
 * Reads `"created_at":<epoch>` out of the decrypted transcript.
 *
 * The prover supplies `offset` — the index of the opening quote of
 * the `"created_at":` marker — as a private hint. The circuit
 *   1. builds a one-hot selector over the plaintext from the hint,
 *   2. reads a 23-byte window starting at the offset,
 *   3. asserts the first 13 bytes match `"created_at":` exactly,
 *   4. asserts the next 10 bytes are ASCII digits and decodes them.
 *
 * Assumptions (documented in the paper):
 * - The attestor emits compact JSON — no whitespace after the colon.
 * - The epoch is exactly 10 digits, i.e. timestamps between
 *   2001-09-09 and 2286-11-20. Out-of-range transcripts fail witness
 *   generation rather than proving something wrong.
 *
 * Bytes past the AEAD's ciphertextLength arrive zeroed (the AEAD
 * masks them), and zero bytes can match neither the marker nor the
 * digit range — so the window provably lies inside the authenticated
 * plaintext.
 */

// Witness-time indicator: 1 if a == b else 0.
function JsonIndEq(a, b) {
    if (a == b) {
        return 1;
    }
    return 0;
}

template JsonTimestampExtract(N) {
    assert(N >= 23);

    signal input  plaintext[N];   // bytes, already range-checked upstream
    signal input  offset;         // index of the marker's opening quote
    signal output creation_timestamp;

    // `"created_at":` — 13 ASCII bytes
    var MARKER[13] = [34, 99, 114, 101, 97, 116, 101, 100, 95, 97, 116, 34, 58];
    var WINDOW = 23;   // 13 marker bytes + 10 digit bytes

    // One-hot selector: oh[k] = 1 iff k == offset.
    signal oh[N];
    var ohSum = 0;
    var ohWeighted = 0;
    for (var k = 0; k < N; k++) {
        oh[k] <-- JsonIndEq(k, offset);
        oh[k] * (oh[k] - 1) === 0;
        ohSum += oh[k];
        ohWeighted += oh[k] * k;
    }
    ohSum === 1;
    ohWeighted === offset;

    // Window read: w[j] = plaintext[offset + j]. Terms with
    // k + j ≥ N drop out, so a window overrunning the buffer reads
    // zeros and fails the marker / digit checks below.
    signal selProd[WINDOW][N];
    signal w[WINDOW];
    for (var j = 0; j < WINDOW; j++) {
        var acc = 0;
        for (var k = 0; k < N; k++) {
            if (k + j < N) {
                selProd[j][k] <== oh[k] * plaintext[k + j];
            } else {
                selProd[j][k] <== 0;
            }
            acc += selProd[j][k];
        }
        w[j] <== acc;
    }

    for (var j = 0; j < 13; j++) {
        w[j] === MARKER[j];
    }

    // Digits: d ∈ [0, 9], value = Σ d·10^(9−i).
    component dBits[10];
    component dLe[10];
    var ts = 0;
    for (var i = 0; i < 10; i++) {
        dBits[i] = Num2Bits(4);
        dBits[i].in <== w[13 + i] - 48;
        dLe[i] = LessEqThan(4);
        dLe[i].in[0] <== w[13 + i] - 48;
        dLe[i].in[1] <== 9;
        dLe[i].out === 1;
        ts += (w[13 + i] - 48) * 10 ** (9 - i);
    }
    creation_timestamp <== ts;
}
