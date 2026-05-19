pragma circom 2.1.6;

/*
 * PublicBinding
 * -------------
 * Pure-anchoring template: every input is consumed in a single squared
 * sum so the snarkjs optimiser does not drop the public signals that the
 * verifier contract is going to read. No semantic check beyond presence.
 *
 * The real binding semantics live in the verifier contract:
 *   - replay protection uses `nonce`
 *   - expiry uses `expiration`
 *   - registry lookup uses `(app_id, claim_type)`
 *
 * The circuit's job is only to make these signals part of the proof's
 * public-input vector so the verifier can reconstruct them.
 */

template PublicBinding() {
    signal input nonce;
    signal input app_id;
    signal input expiration;
    signal input claim_type;
    signal input threshold_months;

    signal acc <== nonce * nonce
                 + app_id * app_id
                 + expiration * expiration
                 + claim_type * claim_type
                 + threshold_months * threshold_months;

    // acc is never compared — its mere existence pins the signals into
    // the witness vector.
    signal sink <== acc - acc;
    sink === 0;
}
