pragma circom 2.1.6;

/*
 * JsonTimestampExtract (Phase-A pass-through, Phase-B real body)
 * --------------------------------------------------------------
 * Phase-A version of this template trusts the witness for the
 * `creation_timestamp` value and only anchors `plaintext` + `offset`
 * into the constraint system so downstream Phase-B work can swap in
 * the real positional-lookup constraints without rewiring the
 * top-level circuit.
 *
 * Phase-B will:
 *   - assert the `offset` points just past a `"created_at":` marker,
 *   - decode the next ASCII digits into a 64-bit integer,
 *   - constrain that integer equals `creation_timestamp_witness`.
 */

template JsonTimestampExtract(N) {
    signal input plaintext[N];
    signal input offset;
    signal input creation_timestamp_witness;
    signal output creation_timestamp;

    creation_timestamp <== creation_timestamp_witness;

    // No-op anchoring so the inputs are referenced and don't get
    // optimised away while the Phase-A stub stands in.
    signal sink <== plaintext[0] - plaintext[0] + offset - offset;
    sink === 0;
}
