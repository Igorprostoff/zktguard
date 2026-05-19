pragma circom 2.1.6;

include "circomlib/circuits/comparators.circom";

/*
 * TimestampThreshold
 * ------------------
 * Enforces that
 *
 *   creation_timestamp <= current_time - threshold_months * SECONDS_PER_MONTH
 *
 * where SECONDS_PER_MONTH is the 30-day constant 2_592_000. Avoids real
 * calendar logic in-circuit — months are nominal. Documented as such in
 * the paper.
 */

template TimestampThreshold() {
    signal input creation_timestamp;
    signal input current_time;
    signal input threshold_months;

    // 30 * 24 * 60 * 60 = 2592000
    var SECONDS_PER_MONTH = 2592000;

    signal cutoff;
    cutoff <== current_time - threshold_months * SECONDS_PER_MONTH;

    // creation_timestamp <= cutoff  ⇔  cutoff - creation_timestamp ≥ 0
    // Use 64-bit comparator: timestamps fit easily in 64 bits.
    component le = LessEqThan(64);
    le.in[0] <== creation_timestamp;
    le.in[1] <== cutoff;
    le.out === 1;
}
