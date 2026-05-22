pragma circom 2.1.6;

/*
 * PublicBinding
 * -------------
 * Pure-anchoring template: every input is consumed in a quadratic
 * constraint so the snarkjs optimiser does not drop the public signals
 * that the verifier contract will read. No semantic check beyond
 * presence.
 *
 * Each squaring is a separate quadratic constraint (Circom does not
 * allow sums of products in one constraint).
 */

template PublicBinding() {
    signal input nonce;
    signal input app_id;
    signal input expiration;
    signal input claim_type;
    signal input threshold_months;

    signal sq_nonce      <== nonce * nonce;
    signal sq_app_id     <== app_id * app_id;
    signal sq_expiration <== expiration * expiration;
    signal sq_claim_type <== claim_type * claim_type;
    signal sq_threshold  <== threshold_months * threshold_months;

    signal acc <== sq_nonce + sq_app_id + sq_expiration + sq_claim_type + sq_threshold;
    signal sink <== acc - acc;
    sink === 0;
}
