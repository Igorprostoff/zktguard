pragma circom 2.1.6;

include "circomlib/circuits/comparators.circom";

/*
 * JsonTimestampExtract (STUB — v0.1-WIP)
 * --------------------------------------
 * Reads the account-creation timestamp out of an ASCII JSON plaintext
 * fragment. The witness supplies the byte offset; the circuit constrains
 * that the offset points just past a known marker (e.g. the prefix
 * `"created":` or `"creation_ts":`) and that the following decimal digits
 * decode to `creation_timestamp`.
 *
 * For v0.1 we stub a fixed-position read of 10 ASCII digits. The
 * production version will need a positional-lookup constraint set; this
 * is tracked as future work in /circuits/STATS.md and the paper.
 */

template JsonTimestampExtract(N) {
    signal input plaintext[N];
    signal input offset;
    signal output creation_timestamp;

    // STUB: copy `creation_timestamp` straight from the witness without
    // tying it to `plaintext`. Replace with positional lookup + digit
    // decoding once AEADDecrypt is real.
    signal witnessed;
    creation_timestamp <== witnessed;

    // No-op anchoring so the inputs are referenced and don't get
    // optimised away while the stub stands in.
    signal sink <== plaintext[0] - plaintext[0] + offset - offset;
    sink === 0;
}
